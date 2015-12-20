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
	RestaurantID  int            `json:"restaurant_id"`
	DistributorID NullInt64      `json:"distributor_id"`
	Distributor   NullString     `json:"distributor"`
	DeliveryTime  time.Time      `json:"delivery_time"`
	Update        time.Time      `json:"update"`
	DeliveryItems []DeliveryItem `json:"delivery_items"`
}

type DeliveryItem struct {
	BeverageID     int         `json:"beverage_id"`
	VersionID      int         `json:"version_id"`
	Product        string      `json:"product"`
	DeliveryID     int         `json:"delivery_id"`
	Quantity       float32     `json:"quantity"`
	Value          float32     `json:"value"`
	DistributorID  NullInt64   `json:"distributor_id"`
	ContainerType  string      `json:"container_type"`
	Deposit        NullFloat64 `json:"deposit"`
	AlcoholType    string      `json:"alcohol_type"`
	PurchaseVolume NullFloat64 `json:"purchase_volume"`
	PurchaseUnit   NullString  `json:"purchase_unit"`
	PurchaseCost   float32     `json:"purchase_cost"`
	PurchaseCount  int         `json:"purchase_count"`
}

type DeliveryUpdate struct {
	Dlv        Delivery `json:"delivery"`
	ChangeKeys []string `json:"change_keys"`
}

func setupDeliveriesHandlers() {
	http.HandleFunc("/deliveries", deliveriesAPIHandler)
}

func createDeliveryXlsxFile(data []byte, sorted_keys []string, suffix string, restaurant_id string, w http.ResponseWriter, r *http.Request, email string, args map[string]string) {

	export_dir := "./export/"
	if os.MkdirAll(export_dir, 0755) != nil {
		http.Error(w, "Unable to find or create export directory!", http.StatusInternalServerError)
		return
	}

	// create a hash from user id as the filename extension
	h := fnv.New32a()
	h.Write([]byte(restaurant_id))
	hash := strconv.FormatUint(uint64(h.Sum32()), 10)
	filename := export_dir + "history_" + suffix + hash + ".xlsx"
	filename = strings.Replace(filename, " ", "_", -1)

	xfile := xlsx.NewFile()
	sheet, _ := xfile.AddSheet("Sheet1")
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

		// XXX Need to convert time to local time using tz_offset, since they are
		// in UTC and not local
		_tz_offset := args["tz_offset"]
		_tz, _ := time.ParseDuration(_tz_offset + "h")
		dlv_date_local := dlv.DeliveryTime.Add(-_tz).String()
		//dlv_date := dlv.DeliveryTime.String()
		key_date := strings.Split(dlv_date_local, " ")[0]
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

	if len(email) > 3 {
		_start_date := args["start_date"]
		_end_date := args["end_date"]
		_tz_offset := args["tz_offset"]

		// dates are in this format:
		// 2015-09-05T07:29:33.629Z
		// need to parse into time
		const parseLongForm = "2006-01-02T15:04:05.000Z"
		start_date, _ := time.Parse(parseLongForm, _start_date)
		end_date, _ := time.Parse(parseLongForm, _end_date)

		// Need to convert date to client's local time by subtracting timezone
		// offset to get the correct dates to display.
		_tz, _ := time.ParseDuration(_tz_offset + "h")
		start_date = start_date.Add(-_tz)
		end_date = end_date.Add(-_tz)

		format_layout := "01/02/2006"
		start_date_str := start_date.Format(format_layout)
		end_date_str := end_date.Format(format_layout)

		date_title := start_date_str
		date_content := ""
		if start_date_str != end_date_str {
			date_title += " - " + end_date_str
			date_content = "from " + start_date_str + " to " + end_date_str
		} else {
			date_content = "on " + start_date_str
		}

		title_layout := "01-02-2006"
		start_date_title := start_date.Format(title_layout)
		end_date_title := end_date.Format(title_layout)
		title_date_title := start_date_title
		if start_date_title != end_date_title {
			title_date_title += "_" + end_date_title
		}

		email_title := "Delivery Spreadsheet: " + date_title
		email_body := "Attached is a spreadsheet with your delivery records " + date_content + "."
		file_location := filename
		file_name := "Deliveries_" + title_date_title + ".xlsx"

		err = sendAttachmentEmail(email, email_title, email_body, file_location, file_name, "application/xlsx")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
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

}

func deliveriesAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {

	case "GET":

		log.Println(time.Now())

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
		email := r.URL.Query().Get("email")

		extra_args := make(map[string]string)
		extra_args["start_date"] = start_date
		extra_args["end_date"] = end_date
		extra_args["tz_offset"] = tz_offset

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
        WHERE deliveries.delivery_time BETWEEN $1 AND $2 
          AND deliveries.restaurant_id=$3 
        ORDER BY delivery_time DESC;`,
			start_date, end_date, test_restaurant_id)
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

			// if exporting, need to apply tz_offset to delivery time because
			// client automatically converts to local time, but on the server the
			// date is in UTC
			//if len(export) > 0 {
			//_tz, _ := time.ParseDuration(tz_offset + "h")
			//dlv.DeliveryTime = dlv.DeliveryTime.Add(-_tz)
			//}

			// for each delivery, get all associated delivery items
			item_rows, err := db.Query(`
        SELECT delivery_items.beverage_id, beverages.version_id, beverages.product, beverages.distributor_id, delivery_items.quantity, delivery_items.value, 
        beverages.alcohol_type, beverages.container_type, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, kegs.deposit 
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
				if err := item_rows.Scan(&item.BeverageID, &item.VersionID, &item.Product, &item.DistributorID, &item.Quantity, &item.Value, &item.AlcoholType, &item.ContainerType, &item.PurchaseVolume, &item.PurchaseUnit, &item.PurchaseCost, &item.PurchaseCount, &item.Deposit); err != nil {
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
				createDeliveryXlsxFile(js, sorted_keys, "all_", test_restaurant_id, w, r, email, extra_args)
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
			err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM distributors WHERE restaurant_id=$1 AND id=$2);", test_restaurant_id, batch.DistributorID).Scan(&exists)
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
		var dlv_id int
		err = db.QueryRow(`
			INSERT INTO deliveries(
				restaurant_id, distributor_id, delivery_time, update) 
			VALUES ($1, $2, $3, $4) RETURNING id;`,
			test_restaurant_id, batch.DistributorID, batch.DeliveryTime, cur_time).Scan(&dlv_id)
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
			err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM beverages WHERE restaurant_id=$1 AND id=$2);", test_restaurant_id, bev_id).Scan(&exists)
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

	case "PUT":
		log.Println("Received /deliveries PUT")
		decoder := json.NewDecoder(r.Body)
		var dlv_update DeliveryUpdate
		err := decoder.Decode(&dlv_update)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Println(dlv_update.Dlv)
		log.Println(dlv_update.ChangeKeys)

		// first make sure the posted delivery_id belongs to the user
		var exists bool
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM deliveries WHERE restaurant_id=$1 AND id=$2);", test_restaurant_id, dlv_update.Dlv.ID).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !exists {
			http.Error(w, "The delivery does not belong to the user!", http.StatusInternalServerError)
			return
		}

		// Here's how we update the keys:
		// Any "special" keys not in the beverage table we handle individually
		// Any keys in the beverage table should match the table's keys so
		// we can just insert them
		//
		// First, handle the "special" keys

		var deliveryItemsChanged bool
		var deliveryChanged bool
		var deliveryUpdateKeys []string
		for _, key := range dlv_update.ChangeKeys {
			if key == "delivery_items" {
				deliveryItemsChanged = true
			} else {
				deliveryChanged = true
				deliveryUpdateKeys = append(deliveryUpdateKeys, key)
			}
		}

		if deliveryChanged {
			log.Println("Do delivery")

			for _, key := range deliveryUpdateKeys {
				// here are the potential key changes:
				//   delivery_time
				//   distributor_id
				if key == "delivery_time" {
					_, err = db.Exec("UPDATE deliveries SET delivery_time=$1 WHERE id=$2", dlv_update.Dlv.DeliveryTime, dlv_update.Dlv.ID)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "distributor_id" {
					_, err = db.Exec("UPDATE deliveries SET distributor_id=$1 WHERE id=$2", dlv_update.Dlv.DistributorID, dlv_update.Dlv.ID)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				}
			}
		}

		// DeliveryItems procedure:
		// Delete all previous delivery_items associated with this delivery
		// re-insert all delivery_items in the posted new delivery
		if deliveryItemsChanged {
			log.Println("Do delivery items ")

			_, err = db.Exec("DELETE FROM delivery_items WHERE delivery_id=$1", dlv_update.Dlv.ID)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			for _, bev := range dlv_update.Dlv.DeliveryItems {
				bev_id := bev.BeverageID
				var exists bool
				err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM beverages WHERE restaurant_id=$1 AND id=$2);", test_restaurant_id, bev_id).Scan(&exists)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				if !exists {
					http.Error(w, "Cannot find beverage associated with your user id!", http.StatusInternalServerError)
					continue
				}

				_, err = db.Exec("INSERT INTO delivery_items(beverage_id, delivery_id, quantity, value) VALUES ($1, $2, $3, $4);", bev.BeverageID, dlv_update.Dlv.ID, bev.Quantity, bev.Value)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
			}
		}

		// update the 'update' key in this delivery to the current time
		cur_time := time.Now().UTC()
		_, err = db.Exec("UPDATE deliveries SET update=$1 WHERE id=$2;", cur_time, dlv_update.Dlv.ID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// return the updated delivery to the user
		/*
			w.Header().Set("Content-Type", "application/json")
			var dlv Delivery
			bev.ID = new_bev_id
			js, err := json.Marshal(&bev)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)
		*/

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
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM deliveries WHERE restaurant_id=$1 AND id=$2);", test_restaurant_id, dlv_id).Scan(&exists)
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
