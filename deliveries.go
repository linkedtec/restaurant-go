package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/tealeg/xlsx"
)

type Delivery struct {
	ID            int            `json:"id"`
	UserID        int            `json:"user_id"`
	DistributorID NullInt64      `json:"distributor_id"`
	Distributor   NullString     `json:"distributor"`
	DeliveryTime  time.Time      `json:"delivery_time"`
	Update        time.Time      `json:"update"`
	DeliveryItems []DeliveryItem `json:"delivery_items"`
}

type DeliveryItem struct {
	BeverageID     int         `json:"beverage_id"`
	Product        string      `json:"product"`
	DeliveryID     int         `json:"delivery_id"`
	Quantity       float32     `json:"quantity"`
	Value          float32     `json:"value"`
	DistributorID  NullInt64   `json:"distributor_id"`
	ContainerType  string      `json:"container_type"`
	Deposit        NullFloat64 `json:"deposit"`
	PurchaseVolume NullFloat64 `json:"purchase_volume"`
	PurchaseUnit   NullString  `json:"purchase_unit"`
	PurchaseCost   float32     `json:"purchase_cost"`
	PurchaseCount  int         `json:"purchase_count"`
}

func setupDeliveriesHandlers() {
	http.HandleFunc("/deliveries", deliveriesAPIHandler)
}

func createDeliveryXlsxFile(data []byte, sorted_keys []string, suffix string, user_id string, w http.ResponseWriter, r *http.Request) {

	export_dir := "./export/"
	if os.MkdirAll(export_dir, 0755) != nil {
		http.Error(w, "Unable to find or create export directory!", http.StatusInternalServerError)
		return
	}

	// create a hash from user id as the filename extension
	h := fnv.New32a()
	h.Write([]byte(test_user_id))
	hash := strconv.FormatUint(uint64(h.Sum32()), 10)
	filename := export_dir + "history_" + suffix + hash + ".xlsx"
	filename = strings.Replace(filename, " ", "_", -1)

	xfile := xlsx.NewFile()
	sheet := xfile.AddSheet("Sheet1")
	// create headers
	row := sheet.AddRow()
	cell := row.AddCell()
	cell = row.AddCell()
	cell.Value = "Distributor"
	cell = row.AddCell()
	cell.Value = "Product"
	cell = row.AddCell()
	cell.Value = "Quantity"
	cell = row.AddCell()
	cell.Value = "Value ($)"

	nr := bytes.NewReader(data)
	decoder := json.NewDecoder(nr)

	var deliveries []Delivery
	err := decoder.Decode(&deliveries)
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	//log.Println(dateInvMap)
	//log.Println(sorted_keys)

	for _, dlv := range deliveries {
		// each key is a date
		daterow := sheet.AddRow()
		cell = daterow.AddCell()
		dlv_date := dlv.DeliveryTime.String()
		key_date := strings.Split(dlv_date, " ")[0]
		cell.Value = key_date // the date, e.g., 2015-01-01
		cell = daterow.AddCell()
		if dlv.Distributor.Valid {
			cell.Value = dlv.Distributor.String
		}

		daterow.AddCell()
		daterow.AddCell()
		date_sum_cell := daterow.AddCell()

		var date_inv_sum float32
		date_inv_sum = 0

		for _, item := range dlv.DeliveryItems {
			bevrow := sheet.AddRow()
			bevrow.AddCell()
			bevrow.AddCell()
			cell = bevrow.AddCell()
			cell.Value = item.Product
			cell = bevrow.AddCell()
			cell.Value = fmt.Sprintf("%.2f", item.Quantity)
			cell = bevrow.AddCell()
			cell.Value = fmt.Sprintf("%.2f", item.Value)

			date_inv_sum += item.Value
		}

		date_sum_cell.Value = fmt.Sprintf("%.2f", date_inv_sum)
		sheet.AddRow() // add empty row to separate dates

	}

	err = xfile.Save(filename)
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	var retfile ExportFile
	retfile.URL = filename[1:] // remove the . at the beginning
	js, err := json.Marshal(retfile)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Write(js)
}

func deliveriesAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {

	case "GET":

		start_date := r.URL.Query().Get("start_date")
		end_date := r.URL.Query().Get("end_date")
		tz_offset := r.URL.Query().Get("tz_offset")
		if tz_offset == "0" {
			tz_offset = "UTC"
		} else if !strings.HasPrefix(tz_offset, "-") {
			tz_offset = "+" + tz_offset
		}
		log.Println("TZ STRING")
		log.Println(tz_offset)
		log.Println(start_date)
		log.Println(end_date)

		// if export is set, that means return a save-able file instead of JSON
		export := r.URL.Query().Get("export")

		if len(start_date) == 0 || len(end_date) == 0 {
			start_date = time.Now().UTC().String()
			// 1 month ago
			end_date = time.Now().AddDate(0, -1, 0).UTC().String()
		}

		var sorted_keys []string
		var allDlvs []Delivery
		rows, err := db.Query(`
        SELECT deliveries.id, deliveries.distributor_id, distributors.name, deliveries.delivery_time 
        FROM deliveries 
        LEFT OUTER JOIN distributors ON (distributors.id=deliveries.distributor_id) 
        WHERE deliveries.delivery_time AT TIME ZONE 'UTC' AT TIME ZONE $1 BETWEEN $2 AND $3 
          AND deliveries.user_id=$4 
        ORDER BY delivery_time DESC;`,
			tz_offset, start_date, end_date, test_user_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var dlv Delivery
			if err := rows.Scan(&dlv.ID, &dlv.DistributorID, &dlv.Distributor, &dlv.DeliveryTime); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			// for each delivery, get all associated delivery items
			item_rows, err := db.Query(`
        SELECT delivery_items.beverage_id, beverages.product, beverages.distributor_id, delivery_items.quantity, delivery_items.value, 
        beverages.container_type, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, kegs.deposit 
        FROM delivery_items 
        	INNER JOIN beverages ON (beverages.id=delivery_items.beverage_id) 
					LEFT OUTER JOIN kegs ON (beverages.keg_id=kegs.id) 
        WHERE delivery_items.delivery_id=$1`,
				dlv.ID)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			defer item_rows.Close()
			for item_rows.Next() {
				var item DeliveryItem
				if err := item_rows.Scan(&item.BeverageID, &item.Product, &item.DistributorID, &item.Quantity, &item.Value, &item.ContainerType, &item.PurchaseVolume, &item.PurchaseUnit, &item.PurchaseCost, &item.PurchaseCount, &item.Deposit); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				dlv.DeliveryItems = append(dlv.DeliveryItems, item)
			}

			allDlvs = append(allDlvs, dlv)
		}

		log.Println(allDlvs)

		js, err := json.Marshal(allDlvs)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if len(export) > 0 {
			switch export {
			case "xlsx":
				log.Println("create xlsx")
				createDeliveryXlsxFile(js, sorted_keys, "all_", test_user_id, w, r)
			}
		} else {
			w.Header().Set("Content-Type", "application/json")
			w.Write(js)
		}

	case "POST":
		decoder := json.NewDecoder(r.Body)
		var batch Delivery
		err := decoder.Decode(&batch)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println("Received POST")
		log.Println(batch)

		// check distributor id is valid if not null
		if batch.DistributorID.Valid {
			var exists bool
			err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM distributors WHERE user_id=$1 AND id=$2);", test_user_id, batch.DistributorID).Scan(&exists)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if !exists {
				http.Error(w, "Cannot find distributor associated with your user id!", http.StatusInternalServerError)
				return
			}
		}
		// first, insert delivery into deliveries
		cur_time := time.Now().UTC()
		_, err = db.Exec("INSERT INTO deliveries(user_id, distributor_id, delivery_time, update) VALUES ($1, $2, $3, $4);", test_user_id, batch.DistributorID, batch.DeliveryTime, cur_time)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var dlv_id int
		err = db.QueryRow("SELECT last_value FROM deliveries_id_seq;").Scan(&dlv_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// for each item in delivery items, check that beverage id belongs to
		// user as authentication.
		// then, insert them into beverage_items
		for _, bev := range batch.DeliveryItems {

			bev_id := bev.BeverageID
			var exists bool
			err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM beverages WHERE user_id=$1 AND id=$2);", test_user_id, bev_id).Scan(&exists)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			if !exists {
				http.Error(w, "Cannot find beverage associated with your user id!", http.StatusInternalServerError)
				continue
			}

			_, err = db.Exec("INSERT INTO delivery_items(beverage_id, delivery_id, quantity, value) VALUES ($1, $2, $3, $4);", bev.BeverageID, dlv_id, bev.Quantity, bev.Value)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
		}

		// return the delivery ID so client reflects new state for e.g., editing
		var ret_dlv Delivery
		ret_dlv.ID = dlv_id
		js, err := json.Marshal(&ret_dlv)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "DELETE":
		dlv_id := r.URL.Query().Get("id")
		log.Println(dlv_id)

		// Deleting Deliveries is a lot simpler than deleting beverages because
		// there is no version_id history.
		//
		// First delete everything in delivery_items with the delivery_id
		// then delete the id entry in deliveries

		// First check that user is authenticated to delete this delivery id
		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM deliveries WHERE user_id=$1 AND id=$2);", test_user_id, dlv_id).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !exists {
			http.Error(w, "The delivery id does not belong to the user!", http.StatusInternalServerError)
			return
		}

		_, err = db.Exec("DELETE FROM delivery_items WHERE delivery_id=$1;", dlv_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		_, err = db.Exec("DELETE FROM deliveries WHERE id=$1;", dlv_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	}
}
