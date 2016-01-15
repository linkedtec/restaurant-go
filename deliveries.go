package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type DistributorDelivery struct {
	DistributorOrderID        int            `json:"do_id"` // the distributor order id
	DeliveryTime              time.Time      `json:"delivery_time"`
	DeliveryTimely            bool           `json:"delivery_timely"`
	DeliveryInvoice           float32        `json:"delivery_invoice"`
	DeliveryInvoiceAcceptable bool           `json:"delivery_invoice_acceptable"`
	Items                     []DeliveryItem `json:"items"`
	AdditionalNotes           NullString     `json:"additional_notes"`
}

type DeliveryItem struct {
	BeverageID      int         `json:"beverage_id"`
	Quantity        NullFloat64 `json:"dlv_quantity"`         // can be empty if quantity matches original PO
	Invoice         NullFloat64 `json:"dlv_invoice"`          // can be empty if invoice matches original PO
	Wholesale       NullFloat64 `json:"dlv_wholesale"`        // if the new invoice wholesale is different from default purchase_cost for bev
	UpdateWholesale NullBool    `json:"dlv_update_wholesale"` // should we update the default purchase_cost to the dlv_wholesale?
	DiscountApplied NullBool    `json:"dlv_discount_applied"` // if there was a discount, was it applied?
	RoughHandling   NullBool    `json:"dlv_rough_handling"`
	DamagedGoods    NullBool    `json:"dlv_damaged_goods"`
	WrongItem       NullBool    `json:"dlv_wrong_item"`
	Comments        NullString  `json:"dlv_comments"`
	Satisfactory    bool        `json:"satisfactory"`
}

func setupDeliveriesHandlers() {
	http.HandleFunc("/deliveries", deliveriesAPIHandler)
}

func deliveriesAPIHandler(w http.ResponseWriter, r *http.Request) {

	privilege := checkUserPrivilege()

	switch r.Method {

	// get an old delivery
	// return the params in do_deliveries
	// and for each item, return the params from do_item_deliveries
	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		do_id := r.URL.Query().Get("id")

		log.Println(do_id)

		var dlv_exists bool
		err := db.QueryRow(`
			SELECT EXISTS(SELECT 1 FROM do_deliveries 
				WHERE distributor_order_id=$1);`, do_id).Scan(&dlv_exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if !dlv_exists {
			log.Println("No Delivery with the Distributor Order ID found.  Quitting...")
			http.Error(w, "No Delivery with the Distributor Order ID found.  Quitting...", http.StatusBadRequest)
			return
		}

		var dorder_dlv DistributorDelivery
		err = db.QueryRow(`
			SELECT distributor_order_id, delivery_time, delivery_timely, 
			delivery_invoice, delivery_invoice_acceptable, additional_notes FROM
			do_deliveries WHERE distributor_order_id=$1;
			`, do_id).Scan(
			&dorder_dlv.DistributorOrderID,
			&dorder_dlv.DeliveryTime,
			&dorder_dlv.DeliveryTimely,
			&dorder_dlv.DeliveryInvoice,
			&dorder_dlv.DeliveryInvoiceAcceptable,
			&dorder_dlv.AdditionalNotes)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		irows, err := db.Query(`
    	SELECT beverage_id, quantity, invoice, wholesale, update_wholesale, 
    	discount_applied, rough_handling, damaged_goods, wrong_item, comments, 
    	satisfactory FROM do_item_deliveries WHERE
    	distributor_order_id=$1;`, do_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		defer irows.Close()
		for irows.Next() {

			var item DeliveryItem
			if err := irows.Scan(
				&item.BeverageID,
				&item.Quantity,
				&item.Invoice,
				&item.Wholesale,
				&item.UpdateWholesale,
				&item.DiscountApplied,
				&item.RoughHandling,
				&item.DamagedGoods,
				&item.WrongItem,
				&item.Comments,
				&item.Satisfactory); err != nil {
				log.Println(err.Error())
				continue
			}

			dorder_dlv.Items = append(dorder_dlv.Items, item)
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&dorder_dlv)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	// post a new delivery
	case "POST":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		decoder := json.NewDecoder(r.Body)
		var dorder DistributorDelivery
		err := decoder.Decode(&dorder)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println("Received POST")
		log.Println(dorder)
		log.Println(dorder.DistributorOrderID)

		// Is there already an entry in do_deliveries
		var dlv_exists bool
		err = db.QueryRow(`
			SELECT EXISTS(SELECT 1 FROM do_deliveries 
				WHERE distributor_order_id=$1);`, dorder.DistributorOrderID).Scan(&dlv_exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// if delivery already exists, should not accept another POST
		if dlv_exists == true {
			log.Println("Delivery already exists, cannot POST new record.  Quitting...")
			http.Error(w, "Delivery already exists, cannot POST new record.  Quitting...", http.StatusBadRequest)
			return
		}

		_, err = db.Exec(`
			INSERT INTO do_deliveries(
				distributor_order_id, delivery_time, delivery_timely, 
				delivery_invoice, delivery_invoice_acceptable, additional_notes) 
			VALUES($1, $2, $3, $4, $5, $6);`,
			dorder.DistributorOrderID,
			dorder.DeliveryTime,
			dorder.DeliveryTimely,
			dorder.DeliveryInvoice,
			dorder.DeliveryInvoiceAcceptable,
			dorder.AdditionalNotes)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		for _, item := range dorder.Items {
			_, err = db.Exec(`
			INSERT INTO do_item_deliveries(
				distributor_order_id, beverage_id, quantity, invoice, 
				wholesale, update_wholesale, discount_applied, 
				rough_handling, damaged_goods, wrong_item, 
				comments, satisfactory) 
			VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);`,
				dorder.DistributorOrderID,
				item.BeverageID,
				item.Quantity,
				item.Invoice,
				item.Wholesale,
				item.UpdateWholesale,
				item.DiscountApplied,
				item.RoughHandling,
				item.DamagedGoods,
				item.WrongItem,
				item.Comments,
				item.Satisfactory)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			if item.UpdateWholesale.Valid == true && item.UpdateWholesale.Bool == true {
				var exists bool
				err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM beverages WHERE restaurant_id=$1 AND id=$2);", test_restaurant_id, item.BeverageID).Scan(&exists)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				if !exists {
					http.Error(w, "The beverage does not belong to the user!", http.StatusInternalServerError)
					continue
				}
				new_bev_id, err := updateBeverageVersion(item.BeverageID)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				_, err = db.Exec("UPDATE beverages SET purchase_cost=$1 WHERE id=$2;", item.Wholesale, new_bev_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}

			}
		}

	}
}
