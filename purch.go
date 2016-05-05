package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/robfig/cron"
	"hash/fnv"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jung-kurt/gofpdf"
)

type PurchaseOrder struct {
	Order             PO_Order           `json:"order"`
	DistributorOrders []DistributorOrder `json:"distributor_orders"`
	DeliveryAddress   RestaurantAddress  `json:"delivery_address"`
	DoSend            bool               `json:"do_send"`
}

type PO_Num struct {
	PO_Num string `json:"po_num"`
}

type PO_Order struct {
	// these are used for GETting
	ID      int       `json:"id"`
	Created time.Time `json:"created"`
	// only these are used for POSTing
	OrderDate           time.Time      `json:"order_date"`
	Sent                bool           `json:"sent"`
	SendLater           bool           `json:"send_later"`
	PurchaseContact     string         `json:"purchase_contact"`
	PurchaseEmail       string         `json:"purchase_email"`
	PurchasePhone       NullString     `json:"purchase_phone"`
	PurchaseFax         NullString     `json:"purchase_fax"`
	PurchaseSaveDefault NullBool       `json:"purchase_save_default"`
	DeliveryAddressType NullString     `json:"delivery_address_type"`
	SendMethod          NullString     `json:"send_method"`
	PO_Num              NullString     `json:"po_num"`
	DeliveryStatus      NullString     `json:"delivery_status"`
	PurchaseCC          []EmailContact `json:"purchase_cc"`
}

type PO_Item struct {
	DistributorOrderID           int         `json:"distributor_order_id"`
	BeverageID                   int         `json:"beverage_id"`
	VersionID                    int         `json:"version_id"`
	BatchCost                    float64     `json:"batch_cost"`
	Deposit                      NullFloat64 `json:"deposit"`
	Quantity                     float64     `json:"quantity"`
	Subtotal                     float64     `json:"subtotal"`
	ResolvedSubtotal             float64     `json:"resolved_subtotal"`
	AdditionalPricing            NullString  `json:"additional_pricing"`
	AdditionalPricingDescription NullString  `json:"additional_pricing_description"`
	DeliveryStatus               NullString  `json:"delivery_status"`
	// only for saving & not sending PO form:
	Product        string      `json:"product"`
	Brewery        NullString  `json:"brewery"`
	AlcoholType    string      `json:"alcohol_type"`
	PurchaseVolume NullFloat64 `json:"purchase_volume"`
	PurchaseUnit   NullString  `json:"purchase_unit"`
	PurchaseCost   float32     `json:"purchase_cost"`
	PurchaseCount  int         `json:"purchase_count"`
	ContainerType  string      `json:"container_type"`
}

type DistributorOrder struct {
	ID              int `json:"id"`
	PurchaseOrderID int `json:"purchase_order_id"`
	ItemCount       int `json:"item_count"`
	// only these are used for POSTing
	Distributor                 string     `json:"distributor"`
	DistributorID               int        `json:"distributor_id"`
	DistributorEmail            NullString `json:"distributor_email"`
	DistributorEmailSaveDefault NullBool   `json:"distributor_email_save_default"`
	DistributorPhone            NullString `json:"distributor_phone"`
	DistributorPhoneSaveDefault NullBool   `json:"distributor_phone_save_default"`
	DistributorContactName      NullString `json:"distributor_contact_name"`
	DeliveryDate                time.Time  `json:"delivery_date"`
	Items                       []PO_Item  `json:"items"`
	Total                       float32    `json:"total"`
	AdditionalNotes             NullString `json:"additional_notes"`
	DO_Num                      NullString `json:"do_num"`
	Delivered                   bool       `json:"delivered"`
}

type PO_SMS struct {
	DistributorPhone string `json:"distributor_phone"`
	Distributor      string `json:"distributor"`
	Content          string `json:"content"`
}

type Budget struct {
	UserID           int         `json:"user_id"`
	MonthlyBudget    NullFloat64 `json:"monthly_budget"`
	TargetRunRate    NullFloat64 `json:"target_run_rate"`
	RemainingBudget  NullFloat64 `json:"remaining_budget"`
	BudgetAlertEmail NullString  `json:"budget_alert_email"`
}

type BudgetUpdate struct {
	UserID     int      `json:"user_id"`
	Budget     Budget   `json:"budget"`
	ChangeKeys []string `json:"change_keys"`
}

func setupPurchaseOrderHandlers() {
	http.HandleFunc("/purchase", purchaseOrderAPIHandler)
	http.HandleFunc("/purchase/all", purchaseOrderAllAPIHandler)
	http.HandleFunc("/purchase/pending", purchaseOrderPendingAPIHandler)
	http.HandleFunc("/purchase/auto", purchaseOrderAutoAPIHandler)
	http.HandleFunc("/purchase/copy", purchaseOrderCopyAPIHandler)
	http.HandleFunc("/purchase/nextponum", purchaseOrderNextNumAPIHandler)
	http.HandleFunc("/purchase/dorder", distributorOrderAPIHandler)
	http.HandleFunc("/purchase/po", purchaseOrderSearchPOAPIHandler)
	http.HandleFunc("/budget", budgetAPIHandler)
}

func setupSendPendingPOsCron() {
	c := cron.New()

	// testing, run every 15 seconds
	//c.AddFunc("0,15,30,45 * * * * *", func() { go sendPendingPOs() })
	// run every hour
	c.AddFunc("0 0 * * * *", func() { go sendPendingPOs() })
	c.Start()
}

func sendPendingPOs() {
	log.Println("Checking for pending POs which need to be sent...")

	// get all unsent purchase orders whose order_date has passed
	// for each one call createRestaurantMenuPage()

	// don't send anything before 6 am
	earliest_send_hour := 8

	// the query:
	//   + the order_date has already passed
	//   + the order has not yet been sent
	//   + the current hour at the restaurant time zone is past the earliest send hour
	rows, err := db.Query(`
    SELECT purchase_orders.id, restaurants.id FROM purchase_orders, restaurants 
    WHERE purchase_orders.restaurant_id=restaurants.id 
    	AND purchase_orders.order_date AT TIME ZONE 'UTC' <= now() 
    	AND purchase_orders.sent=FALSE 
    	AND EXTRACT (HOUR FROM now() AT TIME ZONE restaurants.timezone) >= $1;`, earliest_send_hour)
	if err != nil {
		log.Println("ERROR getting pending POs in sendPendingPOs")
		return
	}

	log.Println(rows)

	defer rows.Close()
	for rows.Next() {
		var po_id string
		var restaurant_id string
		if err := rows.Scan(
			&po_id,
			&restaurant_id); err != nil {
			log.Println(err.Error())
			continue
		}
		//log.Println("FOUND ID:")
		//log.Println(po_id)

		cur_time := time.Now().UTC()
		_, err = db.Exec(`
			UPDATE purchase_orders SET order_date=$1 WHERE id=$2;`, cur_time, po_id)
		if err != nil {
			log.Println(err.Error())
			continue
		}

		po_id_int, _ := strconv.Atoi(po_id)
		purchase_order, err := getPurchaseOrderFromID(po_id_int)
		if err != nil {
			log.Println(err.Error())
			continue
		}

		var w http.ResponseWriter
		var r http.Request
		if purchase_order.Order.SendMethod.String == "email" {
			createPurchaseOrderPDFFile(test_user_id, restaurant_id, purchase_order, true, true, w, &r)
		} else if purchase_order.Order.SendMethod.String == "text" {
			createPurchaseOrderSMS(test_user_id, restaurant_id, purchase_order, true, w, &r)
		} else if purchase_order.Order.SendMethod.String == "save" {
			createPurchaseOrderSaveOnly(test_user_id, restaurant_id, purchase_order, true, w, &r)
		}
		// if purchase order had a CC email, send out CC email
		// by setting split_by_dist_order false and do_send true, it will send
		// a single overview pdf to the CC list only
		if len(purchase_order.Order.PurchaseCC) > 0 {
			createPurchaseOrderPDFFile(test_user_id, test_restaurant_id, purchase_order, false, true, w, &r)
		}

		// if the PO total exceeded the remaining budget, AND there is a
		// contact specified for email alerts, send email alert
		budget, err := getMonthlyBudget(restaurant_id)
		if err != nil {
			log.Println(err.Error())
		}
		if budget.RemainingBudget.Valid && budget.RemainingBudget.Float64 < 0 {
			log.Println("Monthly budget exceeded, sending budget alert!")
			_ = sendBudgetAlert(restaurant_id, budget)
		}

	}
}

func createPurchaseOrderSaveOnly(user_id string, restaurant_id string, purchase_order PurchaseOrder, do_send bool, w http.ResponseWriter, r *http.Request) {
	// Simply return the purchase_order object with a few added params
	if do_send == false {

		// convert OrderTime and DeliveryTime to restaurant timezone
		tz_str, _ := getRestaurantTimeZone(restaurant_id)
		purchase_order.Order.OrderDate = getTimeAtTimezone(purchase_order.Order.OrderDate, tz_str, true)

		// first get the additional params the client needs for display
		for i, dorder := range purchase_order.DistributorOrders {

			purchase_order.DistributorOrders[i].DeliveryDate = getTimeAtTimezone(dorder.DeliveryDate, tz_str, true)

			for j, item := range dorder.Items {
				err := db.QueryRow("SELECT product, brewery, alcohol_type, purchase_volume, purchase_unit, purchase_cost, purchase_count, container_type FROM beverages WHERE id=$1;", item.BeverageID).Scan(
					&purchase_order.DistributorOrders[i].Items[j].Product,
					&purchase_order.DistributorOrders[i].Items[j].Brewery,
					&purchase_order.DistributorOrders[i].Items[j].AlcoholType,
					&purchase_order.DistributorOrders[i].Items[j].PurchaseVolume,
					&purchase_order.DistributorOrders[i].Items[j].PurchaseUnit,
					&purchase_order.DistributorOrders[i].Items[j].PurchaseCost,
					&purchase_order.DistributorOrders[i].Items[j].PurchaseCount,
					&purchase_order.DistributorOrders[i].Items[j].ContainerType)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}

				var deposit NullFloat64
				err = db.QueryRow(`SELECT kegs.deposit FROM kegs, beverages 
					WHERE kegs.id=beverages.keg_id AND beverages.id=$1;`, item.BeverageID).Scan(&deposit)
				if err != nil {
					deposit.Valid = false
					deposit.Float64 = 0
				}
				purchase_order.DistributorOrders[i].Items[j].Deposit = deposit
			}
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&purchase_order)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)
	} else {
		_, err := db.Exec("UPDATE purchase_orders SET sent=TRUE where id=$1;", purchase_order.Order.ID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

}

func createPurchaseOrderSMS(user_id string, restaurant_id string, purchase_order PurchaseOrder, do_send bool, w http.ResponseWriter, r *http.Request) {
	// just need to construct a JSON list of distributor order strings and return

	var restaurant Restaurant
	err := db.QueryRow("SELECT name FROM restaurants WHERE id=$1;", restaurant_id).Scan(&restaurant.Name)
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var po_texts []PO_SMS
	for _, dorder := range purchase_order.DistributorOrders {

		var po_text PO_SMS
		po_text.DistributorPhone = dorder.DistributorPhone.String
		po_text.Distributor = dorder.Distributor

		sms_str := "Automated SMS; DO NOT REPLY\n"
		sms_str += "PO #: " + dorder.DO_Num.String + "\n"
		tz_str, _ := getRestaurantTimeZone(restaurant_id)
		delivery_date_tz := getTimeAtTimezone(dorder.DeliveryDate, tz_str, true)
		log.Println(delivery_date_tz)
		sms_str += "Need by " + delivery_date_tz.Format("Mon, Jan 2 2006") + ":\n\n"

		for _, item := range dorder.Items {

			log.Println(item)
			var bev Beverage
			err := db.QueryRow("SELECT id, version_id, product, purchase_count, container_type FROM beverages WHERE restaurant_id=$1 AND id=$2;", restaurant_id, item.BeverageID).Scan(
				&bev.ID,
				&bev.VersionID,
				&bev.Product,
				&bev.PurchaseCount,
				&bev.ContainerType)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			unit_str := bev.ContainerType
			if bev.PurchaseCount > 1 {
				unit_str = "Case"
			}
			if item.Quantity > 1 {
				unit_str += "s"
			}
			var QtyStr string
			if item.Quantity-float64(int(item.Quantity)) > 0.01 {
				QtyStr = fmt.Sprintf("%.1f", item.Quantity)
			} else {
				QtyStr = fmt.Sprintf("%d", int(item.Quantity))
			}
			sms_str += fmt.Sprintf("%s - %s %s", QtyStr, unit_str, bev.Product)

			if item.AdditionalPricing.Valid {
				desc_line := helperAdditionalPricingDescription(item.AdditionalPricing, item.AdditionalPricingDescription)
				sms_str += fmt.Sprintf(" (%s)\n", desc_line)
			} else {
				sms_str += "\n"
			}
		}

		sms_str += fmt.Sprintf("\nEstimate: $%.2f", dorder.Total)
		if dorder.AdditionalNotes.Valid && len(dorder.AdditionalNotes.String) > 0 {
			sms_str += "\n* " + dorder.AdditionalNotes.String + "\n"
		} else {
			sms_str += "\n"
		}
		sms_str += "\n" + purchase_order.Order.PurchaseContact + "\n"
		sms_str += restaurant.Name.String + "\n"

		if purchase_order.Order.PurchasePhone.Valid == true {
			sms_str += purchase_order.Order.PurchasePhone.String + "\n"
		} else {
			sms_str += purchase_order.Order.PurchaseEmail
		}

		po_text.Content = sms_str

		if do_send == true {
			// send the SMS via twilio
			_, err := twilioSendSMS(dorder.DistributorPhone.String, sms_str, test_restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			po_texts = append(po_texts, po_text)
		}
	}

	// if do_send is false, return a JSON with the po_texts so user can review
	// them on the client
	if do_send == false {
		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&po_texts)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)
	} else {
		_, err := db.Exec("UPDATE purchase_orders SET sent=TRUE where id=$1;", purchase_order.Order.ID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

}

func helperAdditionalPricingDescription(additional_pricing NullString, additional_pricing_description NullString) string {
	desc_line := ""
	if additional_pricing.Valid {
		if additional_pricing_description.Valid {
			desc_line += additional_pricing_description.String + " : "
		}
		// add short description here
		sign := string(additional_pricing.String[0])
		if sign == "*" {
			value := additional_pricing.String[1:len(additional_pricing.String)]
			valuef, _ := strconv.ParseFloat(value, 64)
			desc_line += fmt.Sprintf("%.2f%% Discount", valuef)
		} else {
			trailing := strings.Split(additional_pricing.String, "|")
			value, _ := strconv.ParseFloat(trailing[0], 64)
			apply := trailing[1]
			if sign == "+" {
				desc_line += "+" + fmt.Sprintf("%.2f", value)
			} else {
				desc_line += fmt.Sprintf("%.2f", value)
			}

			if apply == "subtotal" {
				desc_line += " subtotal"
			} else {
				desc_line += " /unit"
			}
		}
	}
	return desc_line
}

func createPurchaseOrderPDFFile(user_id string, restaurant_id string, purchase_order PurchaseOrder, split_by_dist_order bool, do_send bool, w http.ResponseWriter, r *http.Request) {
	export_dir := "./export/"
	if os.MkdirAll(export_dir, 0755) != nil {
		http.Error(w, "Unable to find or create export directory!", http.StatusInternalServerError)
		return
	}

	var restaurant Restaurant
	err := db.QueryRow("SELECT name FROM restaurants WHERE id=$1;", restaurant_id).Scan(&restaurant.Name)
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// create a hash from restaurant id as the filename extension
	h := fnv.New32a()
	h.Write([]byte(restaurant_id))
	hash := strconv.FormatUint(uint64(h.Sum32()), 10)
	filename := export_dir + "purch_" + hash
	filename = strings.Replace(filename, " ", "_", -1)

	var pdf *gofpdf.Fpdf
	// If we're not splitting, we're putting all distributor orders into a single
	// PDF file for review
	if split_by_dist_order == false {
		// New args:
		// 1: orientationStr (P=Portrait)
		// 2: unitStr
		// 3. sizeStr (page size)
		// 4. fontDirStr
		pdf = gofpdf.New("P", "mm", "A4", "")
		pdf.SetTitle("Purchase Order", false)
	}

	var grand_total float64

	// Iterate through the DistributorOrders, adding a page for each
	for _, dorder := range purchase_order.DistributorOrders {

		// if we're sending to distributors, each distributor
		// order is its own PDF which is emailed
		if split_by_dist_order == true {
			pdf = gofpdf.New("P", "mm", "A4", "")
			pdf.SetTitle("Purchase Order", false)
		}
		pdf.AddPage()

		// useful functions:
		// Ln(h float64)
		//     Linebreak
		// MultiCell
		// func (f *Fpdf) GetPageSize() (width, height float64)
		// func (f *Fpdf) GetMargins() (left, top, right, bottom float64)
		// func (f *Fpdf) Cell(w, h float64, txtStr string)
		// func (f *Fpdf) CellFormat(w, h float64, txtStr string, borderStr string, ln int, alignStr string, fill bool, link int, linkStr string)

		pdf.SetFont("helvetica", "", 22)

		//page_width, page_height := pdf.GetPageSize()
		page_width, _ := pdf.GetPageSize()
		//margin_left, margin_top, margin_right, margin_bottom := pdf.GetMargins()
		margin_left, _, margin_right, _ := pdf.GetMargins()
		content_width := page_width - margin_left - margin_right

		// ------------------------------- Header ----------------------------------
		pdf.SetTextColor(120, 120, 120)
		pdf.SetX(margin_left)
		pdf.Cell(0, 6, restaurant.Name.String)

		pdf.SetFont("helvetica", "B", 22)
		wd := pdf.GetStringWidth("Purchase Order") + margin_right
		pdf.SetX(-wd)
		pdf.Cell(0, 6, "Purchase Order")

		pdf.Ln(8)
		pdf.SetFont("helvetica", "", 12)
		po_num_line := "Purchase Order #: " + dorder.DO_Num.String
		wd = pdf.GetStringWidth(po_num_line) + margin_right
		pdf.SetX(-wd)
		pdf.Cell(0, 6, po_num_line)

		pdf.Ln(6)
		tz_str, _ := getRestaurantTimeZone(restaurant_id)
		order_date_tz := getTimeAtTimezone(purchase_order.Order.OrderDate, tz_str, true)
		log.Println("ORDER DATE")
		log.Println(purchase_order.Order.OrderDate)
		log.Println(order_date_tz)
		order_date := fmt.Sprintf("Order Date: %s", order_date_tz.Format("Mon, Jan 2 2006"))
		wd = pdf.GetStringWidth(order_date) + margin_right
		pdf.SetX(-wd)
		pdf.Cell(0, 6, order_date)

		// ---------------------- Vendor + Restaurant Addresses --------------------
		pdf.Ln(14)
		// Vendor
		pdf.SetFillColor(14, 133, 189) // set blue background
		pdf.SetTextColor(255, 255, 255)
		pdf.SetX(margin_left)
		restore_y := pdf.GetY() // for restoring Y position for doing Restaurant address column
		pdf.SetFont("helvetica", "", 10)
		pdf.CellFormat(content_width/2.6, 6, " VENDOR", "", 0, "", true, 0, "")
		pdf.Ln(8)
		pdf.SetTextColor(0, 0, 0)
		pdf.SetFont("helvetica", "", 13)
		pdf.MultiCell(content_width/2.6, 6, dorder.Distributor, "", "", false)
		pdf.SetFont("helvetica", "", 11)
		has_contact_name := false
		if dorder.DistributorContactName.Valid == true && len(dorder.DistributorContactName.String) > 0 {
			pdf.MultiCell(content_width/2.6, 5, dorder.DistributorContactName.String, "", "", false)
			has_contact_name = true
		}
		if dorder.DistributorEmail.Valid == true {
			pdf.MultiCell(content_width/2.6, 5, dorder.DistributorEmail.String, "", "", false)
		} else if dorder.DistributorPhone.Valid == true {
			pdf.MultiCell(content_width/2.6, 5, dorder.DistributorPhone.String, "", "", false)
		}

		pdf.SetFont("helvetica", "", 10)
		pdf.SetTextColor(255, 255, 255)
		if has_contact_name {
			pdf.Ln(3)
		} else {
			pdf.Ln(8)
		}

		pdf.CellFormat(content_width/2.6, 6, " DELIVERY DATE", "", 0, "", true, 0, "")
		pdf.Ln(8)
		pdf.SetTextColor(0, 0, 0)
		pdf.SetFont("helvetica", "", 11)
		delivery_date_tz := getTimeAtTimezone(dorder.DeliveryDate, tz_str, true)
		//log.Println(delivery_date_tz)
		pdf.MultiCell(content_width/2.6, 5, delivery_date_tz.Format("Mon, Jan 2 2006"), "", "", false)

		// Restaurant
		wd = content_width/2.6 + margin_right
		pdf.SetY(restore_y)
		pdf.SetX(-wd)
		pdf.SetTextColor(255, 255, 255)
		pdf.SetFont("helvetica", "", 10)
		pdf.CellFormat(content_width/2.6, 6, " SHIP TO", "", 0, "", true, 0, "")
		pdf.Ln(8)
		pdf.SetX(-wd)
		pdf.SetTextColor(0, 0, 0)
		pdf.SetFont("helvetica", "", 11)
		pdf.MultiCell(content_width/2.6, 5, purchase_order.Order.PurchaseContact, "", "", false)
		pdf.SetX(-wd)
		if purchase_order.DeliveryAddress.AddressOne.Valid && len(purchase_order.DeliveryAddress.AddressOne.String) > 0 {
			pdf.MultiCell(content_width/2.6, 5, purchase_order.DeliveryAddress.AddressOne.String, "", "", false)
			if purchase_order.DeliveryAddress.AddressTwo.Valid && len(purchase_order.DeliveryAddress.AddressTwo.String) > 0 {
				pdf.SetX(-wd)
				pdf.MultiCell(content_width/2.6, 5, purchase_order.DeliveryAddress.AddressTwo.String, "", "", false)
			}
			pdf.SetX(-wd)
			pdf.MultiCell(content_width/2.6, 5, fmt.Sprintf("%s, %s %s", purchase_order.DeliveryAddress.City.String, purchase_order.DeliveryAddress.State.String, purchase_order.DeliveryAddress.Zipcode.String), "", "", false)
		}

		pdf.Ln(2)
		pdf.SetX(-wd)
		contact_email := fmt.Sprintf("Email: %s", purchase_order.Order.PurchaseEmail)
		pdf.MultiCell(content_width/2.6, 5, contact_email, "", "", false)
		if purchase_order.Order.PurchasePhone.Valid && len(purchase_order.Order.PurchasePhone.String) > 7 {
			pdf.SetX(-wd)
			contact_phone := fmt.Sprintf("Phone: %s", purchase_order.Order.PurchasePhone.String)
			pdf.MultiCell(content_width/2.6, 5, contact_phone, "", "", false)
		}
		if purchase_order.Order.PurchaseFax.Valid && len(purchase_order.Order.PurchaseFax.String) > 7 {
			pdf.SetX(-wd)
			contact_fax := fmt.Sprintf("Fax: %s", purchase_order.Order.PurchaseFax.String)
			pdf.MultiCell(content_width/2.6, 5, contact_fax, "", "", false)
		}

		// ----------------------------- ORDER ITEMS -------------------------------
		col_one_width := 0.66
		col_two_width := 0.08
		col_three_width := 0.14
		col_four_width := 0.12
		pdf.SetX(margin_left)
		pdf.SetY(82)
		pdf.SetTextColor(255, 255, 255)
		pdf.SetFont("helvetica", "", 10)
		// set draw color for border color
		pdf.SetDrawColor(255, 255, 255)
		pdf.CellFormat(content_width*col_one_width, 6, " PRODUCT NAME / BREWERY", "", 0, "", true, 0, "")
		pdf.CellFormat(content_width*col_two_width, 6, " QTY", "L", 0, "C", true, 0, "")
		pdf.CellFormat(content_width*col_three_width, 6, " UNIT PRICE", "L", 0, "C", true, 0, "")
		pdf.CellFormat(content_width*col_four_width, 6, " SUBTOTAL", "L", 0, "R", true, 0, "")
		pdf.Ln(6)

		pdf.SetFont("helvetica", "", 11)
		pdf.SetTextColor(0, 0, 0)
		pdf.SetDrawColor(180, 180, 180)
		pdf.SetFillColor(240, 240, 240) // set gray background for odd rows

		var order_total float64

		for i, item := range dorder.Items {

			log.Println(item)
			log.Println("bev id:")
			log.Println(item.BeverageID)
			var bev Beverage
			err := db.QueryRow(`
				SELECT id, version_id, product, brewery, container_type, 
				purchase_cost, purchase_volume, purchase_unit, purchase_count 
				FROM beverages 
				WHERE restaurant_id=$1 AND id=$2;`, restaurant_id, item.BeverageID).Scan(
				&bev.ID,
				&bev.VersionID,
				&bev.Product,
				&bev.Brewery,
				&bev.ContainerType,
				&bev.PurchaseCost,
				&bev.PurchaseVolume,
				&bev.PurchaseUnit,
				&bev.PurchaseCount)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			var deposit NullFloat64
			err = db.QueryRow(`
				SELECT kegs.deposit 
				FROM kegs, beverages 
				WHERE kegs.id=beverages.keg_id AND beverages.id=$1;
				`, item.BeverageID).Scan(&deposit)
			if err != nil {
				deposit.Valid = false
				deposit.Float64 = 0
			}
			log.Println(deposit)

			gray_bg := false
			if i%2 == 1 {
				gray_bg = true
			}
			// e.g., Anchorsteam, 16 oz. Bottle, 24 count
			// purchase_volume purchase_unit product container_type, purchase_count
			var product_line string
			product_line += fmt.Sprintf("%s (", bev.Product)

			if bev.PurchaseVolume.Valid && bev.PurchaseUnit.Valid && len(bev.PurchaseUnit.String) > 0 {
				product_line += fmt.Sprintf("%.1f %s ", bev.PurchaseVolume.Float64, bev.PurchaseUnit.String)
			}
			product_line += bev.ContainerType + ")"
			if bev.PurchaseCount > 1 {
				product_line += fmt.Sprintf(", %d COUNT", bev.PurchaseCount)
			}
			if bev.Brewery.Valid && len(bev.Brewery.String) > 0 {
				product_line += fmt.Sprintf("  /  %s", bev.Brewery.String)
			}

			for pdf.GetStringWidth(product_line) >= content_width*(col_one_width-0.01) {
				product_line = product_line[:len(product_line)-1]
			}
			pdf.CellFormat(content_width*col_one_width, 7, product_line, "", 0, "", gray_bg, 0, "")
			pdf.CellFormat(content_width*col_two_width, 7, strconv.FormatFloat(item.Quantity, 'f', 1, 32), "L", 0, "C", gray_bg, 0, "")
			pdf.CellFormat(content_width*col_three_width, 7, strconv.FormatFloat(float64(bev.PurchaseCost), 'f', 2, 32), "L", 0, "C", gray_bg, 0, "")
			if item.ResolvedSubtotal != item.Subtotal {
				pdf.SetTextColor(210, 210, 210)
			}
			pdf.CellFormat(content_width*col_four_width, 7, strconv.FormatFloat(item.Subtotal, 'f', 2, 32), "L", 0, "R", gray_bg, 0, "")
			pdf.SetTextColor(0, 0, 0)
			// if has deposit or additional pricing, add another line to display them
			if deposit.Valid == true || item.AdditionalPricing.Valid {
				pdf.Ln(5)
				desc_line := "      " + helperAdditionalPricingDescription(item.AdditionalPricing, item.AdditionalPricingDescription)
				dpst_line := ""
				if deposit.Valid {
					dpst_line = fmt.Sprintf("%.2f dpst.", deposit.Float64)
				}

				pdf.SetTextColor(200, 40, 0)
				pdf.CellFormat(content_width*col_one_width, 7, desc_line, "", 0, "", gray_bg, 0, "")
				pdf.CellFormat(content_width*col_two_width, 7, "", "L", 0, "C", gray_bg, 0, "")
				pdf.SetFont("helvetica", "", 10)
				pdf.SetTextColor(150, 150, 150)
				pdf.CellFormat(content_width*col_three_width, 7, dpst_line, "L", 0, "C", gray_bg, 0, "")
				pdf.SetFont("helvetica", "", 11)
				new_subtotal := ""
				if item.Subtotal != item.ResolvedSubtotal {
					new_subtotal = strconv.FormatFloat(item.ResolvedSubtotal, 'f', 2, 32)
					pdf.SetTextColor(200, 40, 0)
				}
				pdf.CellFormat(content_width*col_four_width, 7, new_subtotal, "L", 0, "R", gray_bg, 0, "")
				pdf.SetTextColor(0, 0, 0)
			}
			pdf.Ln(7)

			restore_y = pdf.GetY()

			order_total += item.ResolvedSubtotal
		}

		grand_total += order_total

		restore_y += 12
		pdf.SetY(restore_y)
		bottom_y := restore_y

		// Only show Additional Comments section if any comments exist
		if dorder.AdditionalNotes.Valid == true && len(dorder.AdditionalNotes.String) > 0 {
			pdf.SetFillColor(14, 133, 189) // set blue background
			pdf.SetTextColor(255, 255, 255)
			pdf.SetFont("helvetica", "", 10)
			pdf.CellFormat(content_width*col_one_width, 6, " NOTES & INSTRUCTIONS", "", 0, "", true, 0, "")
			pdf.Ln(8)
			pdf.SetTextColor(0, 0, 0)
			pdf.SetFont("helvetica", "", 11)
			pdf.MultiCell(content_width*(col_one_width-0.01), 5, dorder.AdditionalNotes.String, "", "", false)
			bottom_y = pdf.GetY() - 8
		}

		pdf.SetTextColor(0, 0, 0)
		pdf.SetFont("helvetica", "B", 11)
		pdf.SetY(bottom_y)
		left_x := margin_left + content_width*(col_one_width+col_two_width)
		pdf.SetX(left_x)
		pdf.CellFormat(content_width*col_three_width, 8, "Order Total", "LTB", 0, "L", false, 0, "")
		pdf.CellFormat(content_width*col_four_width, 8, fmt.Sprintf("$ %.2f", order_total), "RTB", 0, "R", false, 0, "")
		/*
			pdf.Ln(6)
			pdf.SetX(left_x)
			pdf.Cell(content_width*col_three_width, 6, "Sales Tax Rate")
			pdf.CellFormat(content_width*col_four_width, 6, "10 %", "", 0, "R", false, 0, "")
			pdf.Ln(6)
			pdf.SetX(left_x)
			pdf.Cell(content_width*col_three_width, 6, "Sales Tax")
			pdf.CellFormat(content_width*col_four_width, 6, "$ 16.80", "", 0, "R", false, 0, "")
		*/

		pdf.Ln(20)
		pdf.SetTextColor(120, 120, 120)
		pdf.SetFont("helvetica", "", 11)
		pdf.SetX(margin_left)
		pdf.MultiCell(content_width, 5, "This unit prices in this Purchase Order reflect the restaurant's latest records, and may not be up to date.  Please include up-to-date unit prices on your invoice provided to the restaurant upon delivery.", "", "C", false)
		pdf.Ln(3)

		contact_line := fmt.Sprintf("Have additional questions?  Please contact:\n%s", purchase_order.Order.PurchaseContact)
		contact_line += fmt.Sprintf("      Email: %s", purchase_order.Order.PurchaseEmail)
		if purchase_order.Order.PurchasePhone.Valid && len(purchase_order.Order.PurchasePhone.String) > 7 {
			contact_line += fmt.Sprintf("      Phone: %s", purchase_order.Order.PurchasePhone.String)
		}

		pdf.MultiCell(content_width, 5, contact_line, "", "C", false)

		if split_by_dist_order == true {
			file_location := fmt.Sprintf("%s_%s.pdf", filename, dorder.Distributor)
			err = pdf.OutputFileAndClose(file_location)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			if do_send == true {
				email_title := fmt.Sprintf("New Purchase Order #%s from %s", dorder.DO_Num.String, restaurant.Name.String)
				email_body := fmt.Sprintf("You've got a new Purchase Order (#%s) from %s!<br/><br/>Order Estimate: <b>$ %.2f</b><br/><br/>Please review the attached PDF order for fulfillment by <b>%s</b>.", dorder.DO_Num.String, restaurant.Name.String, order_total, delivery_date_tz.Format("Mon, Jan 2 2006"))
				file_name := fmt.Sprintf("PurchaseOrder_%s.pdf", restaurant.Name.String)
				err = sendAttachmentEmail(dorder.DistributorEmail.String, email_title, email_body, file_location, file_name, "application/pdf")
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			} else {
				// should only ever need to split by dist order if sending
			}
		}
	}

	if split_by_dist_order == false {
		filename += ".pdf"
		err = pdf.OutputFileAndClose(filename)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if do_send == true && len(purchase_order.Order.PurchaseCC) > 0 {
			email_title := fmt.Sprintf("Fwd: Purchase Order #%s for %s", purchase_order.Order.PO_Num.String, restaurant.Name.String)
			email_body := fmt.Sprintf("A new Purchase Order (#%s) for %s has just been placed and sent to your Distributors.<br/><br/>Attached is a copy of the PO for your records.  You can also find complete PO histories in the Purchase History page of the web app.<br/><br/>Total Estimate: <b>$ %.2f</b><br/><i>* estimates may differ from the actual invoice you will receive from Distributors.</i><br/>", purchase_order.Order.PO_Num.String, restaurant.Name.String, grand_total)
			file_email_name := fmt.Sprintf("PurchaseOrder_%s.pdf", restaurant.Name.String)
			// XXX check additional CC list, and for each CC'ed person, send them an email
			for _, cc_email := range purchase_order.Order.PurchaseCC {
				err = sendAttachmentEmail(cc_email.Email, email_title, email_body, filename, file_email_name, "application/pdf")
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}
		} else {
			// if not do_send, it's for review
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

	if do_send == true {
		_, err := db.Exec("UPDATE purchase_orders SET sent=TRUE where id=$1;", purchase_order.Order.ID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

}

func getPurchaseOrderNumForRestaurant(restaurant_id string) string {
	var prev_po int
	var prev_po_str string
	err := db.QueryRow("SELECT po_num FROM purchase_orders WHERE restaurant_id=$1 ORDER BY po_num DESC LIMIT 1;", restaurant_id).Scan(
		&prev_po_str)
	switch {
	case err == sql.ErrNoRows:
		// if there are no rows, kick things off with number 1
		return fmt.Sprintf("%04d", 1)
	case err != nil:
		return "error"
	}

	prev_po, _ = strconv.Atoi(prev_po_str)

	return fmt.Sprintf("%04d", prev_po+1)
}

func purchaseOrderNextNumAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {

	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		// XXX Need to post restaurant_id here and valdiate user

		var po_num PO_Num
		po_num.PO_Num = getPurchaseOrderNumForRestaurant(test_restaurant_id)

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(po_num)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	}
}

// For creating the Automatic Purchase Order
// Returns DistributorOrders populated with active menu PO_Items.  Only
// returns the id and version_id for these bevs, up to caller to populate
// their details.
func purchaseOrderAutoAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {

	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		// XXX in the future need to validate poster is authenticated to query
		// for this restaurant.  Need to replace user_id in query with restaurant_id
		//restaurant_id := r.URL.Query().Get("restaurant_id")

		var dist_orders []DistributorOrder
		var processed_dist_ids []int

		// get all beverages for restaurant whose sale_status not Inactive or NULL
		rows, err := db.Query(`
			SELECT id, version_id, distributor_id FROM beverages WHERE restaurant_id=$1 AND sale_status IS NOT NULL AND distributor_id IS NOT NULL AND sale_status!='Inactive';`,
			test_restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var bev Beverage
			if err := rows.Scan(
				&bev.ID,
				&bev.VersionID,
				&bev.DistributorID); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			// if bev.DistributorID not in processed_dist_ids, create a new
			// DistributorOrder and add bev to its Items, and add bev.DistributorID
			// to processed_dist_ids
			//
			// otherwise, get the existing DistributorOrder from dist_orders
			// and add bev to its Items
			dist_already_added := false
			for _, b := range processed_dist_ids {
				if b == int(bev.DistributorID.Int64) {
					dist_already_added = true
					break
				}
			}

			if !dist_already_added {
				var new_dorder DistributorOrder
				var new_item PO_Item
				new_item.BeverageID = bev.ID
				new_item.VersionID = bev.VersionID
				new_dorder.Items = append(new_dorder.Items, new_item)
				new_dorder.DistributorID = int(bev.DistributorID.Int64)

				dist_orders = append(dist_orders, new_dorder)
				processed_dist_ids = append(processed_dist_ids, int(bev.DistributorID.Int64))

			} else {
				// get the existing dist order
				var dist_i int
				for i, b := range dist_orders {
					if b.DistributorID == int(bev.DistributorID.Int64) {
						dist_i = i
						break
					}
				}
				// add the bev to its Items
				var new_item PO_Item
				new_item.BeverageID = bev.ID
				new_item.VersionID = bev.VersionID
				dist_orders[dist_i].Items = append(dist_orders[dist_i].Items, new_item)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&dist_orders)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	}
}

// For creating the Copied Purchase Order
// Much like the Auto handler, Returns DistributorOrders populated with
// active menu PO_Items.  In additional to id and version_id and items,
// returns the order's contact info, delivery address type, and additional
// comments for the distributor orders
func purchaseOrderCopyAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {

	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		// XXX in the future need to validate poster is authenticated to query
		// for this restaurant.  Need to replace user_id in query with restaurant_id
		//restaurant_id := r.URL.Query().Get("restaurant_id")

		copy_id := r.URL.Query().Get("copy_id")

		// first get the purchase order, along with contact information
		var copy_po PurchaseOrder
		var purchase_cc_id NullInt64
		err := db.QueryRow(`
			SELECT purchase_contact, purchase_email, purchase_phone, purchase_fax, purchase_cc 
			FROM purchase_orders WHERE id=$1;`, copy_id).Scan(
			&copy_po.Order.PurchaseContact,
			&copy_po.Order.PurchaseEmail,
			&copy_po.Order.PurchasePhone,
			&copy_po.Order.PurchaseFax,
			&purchase_cc_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// for purchase_cc_id, need to fetch contact from contact_emails table
		if purchase_cc_id.Valid {
			var cc_email EmailContact
			err = db.QueryRow(`
				SELECT email FROM contact_emails WHERE id=$1`, purchase_cc_id.Int64).Scan(&cc_email.Email)
			copy_po.Order.PurchaseCC = append(copy_po.Order.PurchaseCC, cc_email)
		}

		// now get all distributor orders associated with the purchase order
		drows, err := db.Query(`
			SELECT id, distributor_id, distributor_email, distributor_phone, distributor_contact_name, additional_notes 
			FROM distributor_orders WHERE purchase_order_id=$1;`, copy_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer drows.Close()
		for drows.Next() {
			var dist_order DistributorOrder
			if err := drows.Scan(
				&dist_order.ID,
				&dist_order.DistributorID,
				&dist_order.DistributorEmail,
				&dist_order.DistributorPhone,
				&dist_order.DistributorContactName,
				&dist_order.AdditionalNotes); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			// now get the items for this distributor order
			// make sure to get each item's version_id in addition to beverage_id
			irows, err := db.Query(`
				SELECT beverage_id, quantity, additional_pricing, additional_pricing_description 
				FROM distributor_order_items WHERE distributor_order_id=$1;`, dist_order.ID)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			defer irows.Close()
			for irows.Next() {
				var item PO_Item
				if err := irows.Scan(
					&item.BeverageID,
					&item.Quantity,
					&item.AdditionalPricing,
					&item.AdditionalPricingDescription); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				// get the version_id
				err = db.QueryRow(`SELECT version_id FROM beverages WHERE id=$1`, item.BeverageID).Scan(&item.VersionID)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				dist_order.Items = append(dist_order.Items, item)
			}

			copy_po.DistributorOrders = append(copy_po.DistributorOrders, dist_order)
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&copy_po)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	}
}

func purchaseOrderPendingAPIHandler(w http.ResponseWriter, r *http.Request) {

	privilege := checkUserPrivilege()

	switch r.Method {

	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		// note we return unconverted times here so that client can convert that
		// to local JS Date object.  Don't use AT TIME ZONE in this query!
		var purchase_orders []PurchaseOrder
		rows, err := db.Query(`
			SELECT id, order_date, send_method, po_num 
				FROM purchase_orders 
				WHERE restaurant_id=$1 AND sent=FALSE 
			ORDER BY order_date ASC;`,
			test_restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var purchase_order PurchaseOrder
			if err := rows.Scan(
				&purchase_order.Order.ID,
				&purchase_order.Order.OrderDate,
				&purchase_order.Order.SendMethod,
				&purchase_order.Order.PO_Num); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			drows, err := db.Query(`
				SELECT id, distributor_id, distributor, total, do_num 
					FROM distributor_orders WHERE purchase_order_id=$1;`, purchase_order.Order.ID)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			defer drows.Close()
			for drows.Next() {
				var distributor_order DistributorOrder
				if err := drows.Scan(
					&distributor_order.ID,
					&distributor_order.DistributorID,
					&distributor_order.Distributor,
					&distributor_order.Total,
					&distributor_order.DO_Num); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}

				err = db.QueryRow("SELECT COUNT(beverage_id) FROM distributor_order_items WHERE distributor_order_id=$1;", distributor_order.ID).Scan(
					&distributor_order.ItemCount)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				purchase_order.DistributorOrders = append(purchase_order.DistributorOrders, distributor_order)
			}

			purchase_orders = append(purchase_orders, purchase_order)
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(purchase_orders)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":

		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		// POST on /purchase/pending is to 'Send Now' on a pending purchase order
		// first verify that the posted po_id is indeed pending
		// update the DB purchase_orders.order_date to now()
		// get PurchaseOrder struct from posted id
		// create PDF / SMS / Save Only and send=true

		decoder := json.NewDecoder(r.Body)
		var order PO_Order
		err := decoder.Decode(&order)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		var sent bool
		err = db.QueryRow(`
			SELECT sent FROM purchase_orders WHERE id=$1`, order.ID).Scan(&sent)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if sent == true {
			http.Error(w, "The PO specified has already been sent!", http.StatusBadRequest)
			return
		}

		cur_time := time.Now().UTC()
		_, err = db.Exec(`
			UPDATE purchase_orders SET order_date=$1 WHERE id=$2;`, cur_time, order.ID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		purchase_order, err := getPurchaseOrderFromID(order.ID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if purchase_order.Order.SendMethod.String == "email" {
			createPurchaseOrderPDFFile(test_user_id, test_restaurant_id, purchase_order, true, true, w, r)
		} else if purchase_order.Order.SendMethod.String == "text" {
			createPurchaseOrderSMS(test_user_id, test_restaurant_id, purchase_order, true, w, r)
		} else if purchase_order.Order.SendMethod.String == "save" {
			createPurchaseOrderSaveOnly(test_user_id, test_restaurant_id, purchase_order, true, w, r)
		}
		// if purchase order had a CC email, send out CC email
		// by setting split_by_dist_order false and do_send true, it will send
		// a single overview pdf to the CC list only
		if len(purchase_order.Order.PurchaseCC) > 0 {
			createPurchaseOrderPDFFile(test_user_id, test_restaurant_id, purchase_order, false, true, w, r)
		}

		// if the PO total exceeded the remaining budget, AND there is a
		// contact specified for email alerts, send email alert
		budget, err := getMonthlyBudget(test_restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		if budget.RemainingBudget.Valid && budget.RemainingBudget.Float64 < 0 {
			log.Println("Monthly budget exceeded, sending budget alert!")
			_ = sendBudgetAlert(test_restaurant_id, budget)
		}

	case "DELETE":

		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		// CANNOT delete purchase_orders which have already been sent.
		// First check that purchase_orders.sent is not TRUE for the po to be deleted
		po_id := r.URL.Query().Get("id")

		var sent bool
		err := db.QueryRow("SELECT sent FROM purchase_orders WHERE restaurant_id=$1 AND id=$2;", test_restaurant_id, po_id).Scan(&sent)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if sent == true {
			log.Println("Cannot delete Purchase Order which has already been sent!")
			http.Error(w, "Cannot delete Purchase Order which has already been sent!", http.StatusBadRequest)
			return
		}

		// delete all things associated with this purchase_order:
		//     - distributor_order_items,
		//     - distributor_orders
		drows, err := db.Query(`
			SELECT id FROM distributor_orders WHERE purchase_order_id=$1`, po_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer drows.Close()
		for drows.Next() {
			var dorder_id int
			if err := drows.Scan(&dorder_id); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			// delete all distributor order items associated with distributor order
			_, err = db.Exec("DELETE FROM distributor_order_items WHERE distributor_order_id=$1;", dorder_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			// delete distributor order itself
			_, err = db.Exec("DELETE FROM distributor_orders WHERE id=$1;", dorder_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
		}

		// now delete the purchase order itself
		_, err = db.Exec("DELETE FROM purchase_orders WHERE id=$1;", po_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	}
}

// this is an internal helper function which, given a slice of PurchaseOrders
// populated with only their IDs, retrieves the relevant information for
// viewing their history, such as created time, order date, send method, etc.
// Used for getting PO history within time range (purchaseOrderAllAPIHandler),
// or by specific po_num (purchaseOrderSearchPOAPIHandler)
func getPurchaseOrderHistoryFromPurchaseOrderIds(pos []PurchaseOrder, w http.ResponseWriter, r *http.Request) (ret_pos []PurchaseOrder, err error) {
	//ret_pos = make([]PurchaseOrder, len(pos), (cap(pos)+1)*2)
	ret_pos = pos
	tz_str, _ := getRestaurantTimeZone(test_restaurant_id)
	for i, po := range ret_pos {
		err = db.QueryRow(`
			SELECT created AT TIME ZONE 'UTC' AT TIME ZONE $1, id, (order_date AT TIME ZONE 'UTC' AT TIME ZONE $1) AS local_order_date, send_method, po_num 
				FROM purchase_orders WHERE id=$2;`,
			tz_str, po.Order.ID).Scan(
			&ret_pos[i].Order.Created,
			&ret_pos[i].Order.ID,
			&ret_pos[i].Order.OrderDate,
			&ret_pos[i].Order.SendMethod,
			&ret_pos[i].Order.PO_Num)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return ret_pos, err
		}

		drows, err := db.Query(`
				SELECT id, distributor_id, distributor, total, do_num 
					FROM distributor_orders WHERE purchase_order_id=$1;`, po.Order.ID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			continue
		}

		defer drows.Close()
		for drows.Next() {
			var distributor_order DistributorOrder
			if err := drows.Scan(
				&distributor_order.ID,
				&distributor_order.DistributorID,
				&distributor_order.Distributor,
				&distributor_order.Total,
				&distributor_order.DO_Num); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			err = db.QueryRow("SELECT COUNT(beverage_id) FROM distributor_order_items WHERE distributor_order_id=$1;", distributor_order.ID).Scan(
				&distributor_order.ItemCount)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			// to see whether this distributor order has a recorded delivery,
			// check to see if any entries in TABLE do_deliveries reference it
			err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM do_deliveries WHERE distributor_order_id=$1);", distributor_order.ID).Scan(
				&distributor_order.Delivered)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			ret_pos[i].DistributorOrders = append(ret_pos[i].DistributorOrders, distributor_order)
		}
	}

	return ret_pos, err
}

func purchaseOrderSearchPOAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {

	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		po_num := r.URL.Query().Get("po_num")
		// if po_num starts with '#', trim it
		if string(po_num[0]) == "#" {
			po_num = string(po_num[1:len(po_num)])
		}

		if len(po_num) < 4 {
			http.Error(w, "po_num provided is too short!", http.StatusBadRequest)
		}

		log.Println(po_num)

		var purchase_orders []PurchaseOrder
		rows, err := db.Query(`
			SELECT DISTINCT purchase_order_id 
			FROM distributor_orders 
			WHERE distributor_orders.do_num LIKE '%' || $1 || '%' ORDER BY purchase_order_id DESC;`, po_num)
		if err != nil {
			switch {
			// If there were no rows, that means the beverage was probably deleted (no current).  In that case don't do the update
			case err == sql.ErrNoRows:
				// do nothing
			case err != nil:
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
		defer rows.Close()
		for rows.Next() {
			var purchase_order PurchaseOrder
			if err := rows.Scan(
				&purchase_order.Order.ID); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			purchase_orders = append(purchase_orders, purchase_order)
		}

		purchase_orders, err = getPurchaseOrderHistoryFromPurchaseOrderIds(purchase_orders, w, r)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(purchase_orders)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)
	}
}

func purchaseOrderAllAPIHandler(w http.ResponseWriter, r *http.Request) {

	privilege := checkUserPrivilege()

	switch r.Method {

	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		start_date := r.URL.Query().Get("start_date")
		end_date := r.URL.Query().Get("end_date")
		include_pending := r.URL.Query().Get("include_pending")
		//tz_str, _ := getRestaurantTimeZone(test_restaurant_id)
		log.Println(start_date)
		log.Println(end_date)

		query_str := `SELECT id FROM purchase_orders WHERE order_date BETWEEN $1 AND $2 AND restaurant_id=$3 `
		if include_pending != "true" {
			query_str += `AND sent=TRUE `
		}
		query_str += `ORDER BY order_date DESC;`

		var purchase_orders []PurchaseOrder
		rows, err := db.Query(query_str,
			start_date, end_date, test_restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var purchase_order PurchaseOrder
			if err := rows.Scan(
				&purchase_order.Order.ID); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			purchase_orders = append(purchase_orders, purchase_order)
		}

		purchase_orders, err = getPurchaseOrderHistoryFromPurchaseOrderIds(purchase_orders, w, r)

		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(purchase_orders)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)
	}
}

func distributorOrderAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {

	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		// gets a single distributor order via id
		do_id := r.URL.Query().Get("id")

		tz_str, _ := getRestaurantTimeZone(test_restaurant_id)

		var dist_order DistributorOrder
		err := db.QueryRow(`
			SELECT id, distributor, delivery_date AT TIME ZONE 'UTC' AT TIME ZONE $1, total, do_num FROM distributor_orders WHERE id=$2;`, tz_str, do_id).Scan(
			&dist_order.ID,
			&dist_order.Distributor,
			&dist_order.DeliveryDate,
			&dist_order.Total,
			&dist_order.DO_Num)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		irows, err := db.Query(`
				SELECT beverage_id, quantity, batch_cost, subtotal, resolved_subtotal, 
				additional_pricing, additional_pricing_description, delivery_status 
					FROM distributor_order_items WHERE distributor_order_id=$1;`, dist_order.ID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer irows.Close()
		for irows.Next() {
			var item PO_Item
			if err := irows.Scan(
				&item.BeverageID,
				&item.Quantity,
				&item.BatchCost,
				&item.ResolvedSubtotal,
				&item.AdditionalPricing,
				&item.AdditionalPricingDescription,
				&item.DeliveryStatus); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			err = db.QueryRow("SELECT product, brewery, purchase_volume, purchase_unit, purchase_cost, purchase_count, container_type FROM beverages WHERE id=$1;", item.BeverageID).Scan(
				&item.Product,
				&item.Brewery,
				&item.PurchaseVolume,
				&item.PurchaseUnit,
				&item.PurchaseCost,
				&item.PurchaseCount,
				&item.ContainerType)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			dist_order.Items = append(dist_order.Items, item)
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&dist_order)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

  case "DELETE":

    if !hasBasicPrivilege(privilege) {
      http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
      return
    }

    //restaurant_id := r.URL.Query().Get("test_restaurant_id")
    do_id := r.URL.Query().Get("do_id")
    
    // Tables potentially affected: 
    //      distributor_order_items
    //      distributor_orders
    //      do_deliveries
    //      do_item_deliveries
    //      purchase_orders
    //
    // 1. First confirm do_id exists in distributor_orders
    //
    // 2. Delete any do_deliveries and do_item_deliveries which match do_id
    //
    // 3. Delete all distributor_order_items and distributor_orders which 
    //    match do_id
    //
    // 4. If PO no longer has any distributor_orders, delete the purchase order

    var exists bool
    err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM distributor_orders WHERE id=$1);", do_id).Scan(&exists)
    if err != nil {
      log.Println(err.Error())
      http.Error(w, err.Error(), http.StatusInternalServerError)
      return
    }
    if !exists {
      http.Error(w, "No distributor order with posted ID found...", http.StatusBadRequest)
      return
    }

    var po_id int
    err = db.QueryRow("SELECT purchase_order_id FROM distributor_orders WHERE id=$1;", do_id).Scan(&po_id)
    if err != nil {
      log.Println(err.Error())
      http.Error(w, err.Error(), http.StatusInternalServerError)
      return
    }

    // XXX Verify restaurant id matches user_id

    _, err = db.Exec("DELETE FROM do_item_deliveries WHERE distributor_order_id=$1;", do_id)
    if err != nil {
      log.Println(err.Error())
      http.Error(w, err.Error(), http.StatusInternalServerError)
      return
    }
    _, err = db.Exec("DELETE FROM do_deliveries WHERE distributor_order_id=$1;", do_id)
    if err != nil {
      log.Println(err.Error())
      http.Error(w, err.Error(), http.StatusInternalServerError)
      return
    }
    _, err = db.Exec("DELETE FROM distributor_order_items WHERE distributor_order_id=$1;", do_id)
    if err != nil {
      log.Println(err.Error())
      http.Error(w, err.Error(), http.StatusInternalServerError)
      return
    }
    _, err = db.Exec("DELETE FROM distributor_orders WHERE id=$1;", do_id)
    if err != nil {
      log.Println(err.Error())
      http.Error(w, err.Error(), http.StatusInternalServerError)
      return
    }

    var num_dos_in_po int
    err = db.QueryRow("SELECT COUNT(DISTINCT id) FROM distributor_orders WHERE purchase_order_id=$1;", po_id).Scan(&num_dos_in_po)
    if err != nil {
      log.Println(err.Error())
      http.Error(w, err.Error(), http.StatusInternalServerError)
      return
    }
    // if the parent PO has no more distributor orders, delete it as well
    if num_dos_in_po == 0 {
      _, err = db.Exec("DELETE FROM purchase_orders WHERE id=$1;", po_id)
      if err != nil {
        log.Println(err.Error())
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
      }
    }

	}
}

func getPurchaseOrderFromID(po_id int) (PurchaseOrder, error) {
	// XXX VERY IMPORTANT NOTE HERE:
	// We get all the order_date, delivery_date in time zone UTC instead of
	// user's / restaurant's local time to reproduce the conditions when they
	// first post from client, which is in UTC.  We manually correct UTC to
	// local timezone when we construct the PDF / SMS etc returned, but we need
	// to query them as UTC or the correction will be doubly-applied
	var purchase_order PurchaseOrder
	var email_contact EmailContact
	err := db.QueryRow(`
			SELECT id, order_date, sent, purchase_contact, purchase_email, purchase_phone, purchase_fax, purchase_cc, send_method, po_num FROM purchase_orders WHERE id=$1;`, po_id).Scan(
		&purchase_order.Order.ID,
		&purchase_order.Order.OrderDate,
		&purchase_order.Order.Sent,
		&purchase_order.Order.PurchaseContact,
		&purchase_order.Order.PurchaseEmail,
		&purchase_order.Order.PurchasePhone,
		&purchase_order.Order.PurchaseFax,
		&email_contact.ID,
		&purchase_order.Order.SendMethod,
		&purchase_order.Order.PO_Num)
	if err != nil {
		return purchase_order, err
	}

	if email_contact.ID.Valid {
		err = db.QueryRow(`
			SELECT email FROM contact_emails WHERE id=$1;`, email_contact.ID.Int64).Scan(&email_contact.Email)
		if err != nil {
			return purchase_order, err
		}
		purchase_order.Order.PurchaseCC = append(purchase_order.Order.PurchaseCC, email_contact)
	}

	err = db.QueryRow("SELECT addr1, addr2, city, state, zipcode FROM purchase_orders WHERE id=$1;", po_id).Scan(
		&purchase_order.DeliveryAddress.AddressOne,
		&purchase_order.DeliveryAddress.AddressTwo,
		&purchase_order.DeliveryAddress.City,
		&purchase_order.DeliveryAddress.State,
		&purchase_order.DeliveryAddress.Zipcode)
	if err != nil {
		return purchase_order, err
	}

	rows, err := db.Query(`
			SELECT id, distributor, distributor_id, distributor_email, distributor_phone, 
				distributor_contact_name, 
				delivery_date, total, additional_notes, do_num FROM distributor_orders 
			WHERE purchase_order_id=$1`,
		po_id)
	if err != nil {
		return purchase_order, err
	}
	defer rows.Close()
	for rows.Next() {
		var distributor_order DistributorOrder
		if err := rows.Scan(
			&distributor_order.ID,
			&distributor_order.Distributor,
			&distributor_order.DistributorID,
			&distributor_order.DistributorEmail,
			&distributor_order.DistributorPhone,
			&distributor_order.DistributorContactName,
			&distributor_order.DeliveryDate,
			&distributor_order.Total,
			&distributor_order.AdditionalNotes,
			&distributor_order.DO_Num); err != nil {
			log.Println(err.Error())
			continue
		}

		irows, err := db.Query(`
				SELECT beverage_id, quantity, batch_cost, subtotal, 
				resolved_subtotal, additional_pricing, additional_pricing_description  
					FROM distributor_order_items WHERE distributor_order_id=$1;`, distributor_order.ID)
		if err != nil {
			log.Println(err.Error())
			continue
		}
		defer irows.Close()
		for irows.Next() {
			var item PO_Item
			if err := irows.Scan(
				&item.BeverageID,
				&item.Quantity,
				&item.BatchCost,
				&item.Subtotal,
				&item.ResolvedSubtotal,
				&item.AdditionalPricing,
				&item.AdditionalPricingDescription); err != nil {
				log.Println(err.Error())
				continue
			}

			distributor_order.Items = append(distributor_order.Items, item)
		}
		purchase_order.DistributorOrders = append(purchase_order.DistributorOrders, distributor_order)

	}

	return purchase_order, nil
}

func purchaseOrderAPIHandler(w http.ResponseWriter, r *http.Request) {

	privilege := checkUserPrivilege()

	switch r.Method {

	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		// gets a single purchase order PDF via id
		_po_id := r.URL.Query().Get("id")
		// an optional argument from client if we're overriding the order_date
		// for display back, for reviewing "Send Now" versions of pending orders
		// if none was specified will be empty string ""
		order_date_override := r.URL.Query().Get("order_date_override")
		// optional argument if we want to view the purchase order in a different
		// way than it was originally sent.  e.g., if send_method was originally
		// 'email' and we want to view it as 'text'.
		// this is also used for recording deliveries, when we want to get
		// everything as 'save' so we get additional product info
		view_override := r.URL.Query().Get("view_override")

		po_id, _ := strconv.Atoi(_po_id)
		purchase_order, err := getPurchaseOrderFromID(po_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if order_date_override != "" && len(order_date_override) > 3 {
			log.Println(order_date_override)
			tz_str, _ := getRestaurantTimeZone(test_restaurant_id)
			order_date := getTimeAtTimezoneFromString(order_date_override, tz_str, true)
			log.Println("Overriden:")
			log.Println(order_date)
			purchase_order.Order.OrderDate = order_date
		}

		view_method := purchase_order.Order.SendMethod.String
		if view_override != "" && len(view_override) > 1 {
			view_method = view_override
		}

		if view_method == "email" {
			createPurchaseOrderPDFFile(test_user_id, test_restaurant_id, purchase_order, false, false, w, r)
		} else if view_method == "text" {
			createPurchaseOrderSMS(test_user_id, test_restaurant_id, purchase_order, false, w, r)
		} else if view_method == "save" {
			createPurchaseOrderSaveOnly(test_user_id, test_restaurant_id, purchase_order, false, w, r)
		}

	case "POST":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		// receives:
		// Order Information:
		//     - order date
		//     - send later
		//     - purchase contact
		//     - purchase email
		//     - purchase phone
		//     - purchase fax
		//     - purchase save default
		//     - restautant delivery address type (restaurant or delivery)
		// Distributor Orders
		//     - distributor id
		//     - distributor email
		//     - distributor overwrite default email
		//     - delivery date
		//     - ordered items:
		//         - item id
		//         - item quantity
		//         - item subtotal (original, prior to additional pricing)
		//         - item resolved subtotal (with applied additional pricing)
		//         - item additional pricing
		//         - item additional pricing description
		//     - purchase total
		//
		// creates PDF and saves it to /export directory
		// returns PDF to user, which displays on page

		log.Println(r.Body)

		decoder := json.NewDecoder(r.Body)
		var order PurchaseOrder
		err := decoder.Decode(&order)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println(order)

		if order.Order.DeliveryAddressType.Valid && len(order.Order.DeliveryAddressType.String) > 0 {
			if order.Order.DeliveryAddressType.String == "delivery" {
				err = db.QueryRow("SELECT delivery_addr1, delivery_addr2, delivery_city, delivery_state, delivery_zipcode FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(
					&order.DeliveryAddress.AddressOne,
					&order.DeliveryAddress.AddressTwo,
					&order.DeliveryAddress.City,
					&order.DeliveryAddress.State,
					&order.DeliveryAddress.Zipcode)
			} else {
				err = db.QueryRow("SELECT addr1, addr2, city, state, zipcode FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(
					&order.DeliveryAddress.AddressOne,
					&order.DeliveryAddress.AddressTwo,
					&order.DeliveryAddress.City,
					&order.DeliveryAddress.State,
					&order.DeliveryAddress.Zipcode)
			}
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		// Note: we ALWAYS save default emails / contact info if specified,
		// even if doSend is not specified.  This is because if the user intends
		// to save default, it doesn't matter if it's pre-send review.  It's
		// annoying to review, cancel, and have save default info lost.
		// If save default, overwrite restaurant contact info
		// If the CC list was not null, add the cc email id
		var cc_id NullInt64
		cc_id.Valid = false
		if len(order.Order.PurchaseCC) > 0 {
			email := order.Order.PurchaseCC[0].Email
			test_restaurant_id_int, _ := strconv.Atoi(test_restaurant_id)
			cc_id = getOrAddContactEmail(email, test_restaurant_id_int)
		}

		if order.Order.PurchaseSaveDefault.Valid && order.Order.PurchaseSaveDefault.Bool == true {
			_, err = db.Exec("UPDATE restaurants SET purchase_contact=$1, purchase_email=$2, purchase_phone=$3, purchase_fax=$4, purchase_cc=$5 WHERE id=$6", order.Order.PurchaseContact, order.Order.PurchaseEmail, order.Order.PurchasePhone, order.Order.PurchaseFax, cc_id, test_restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		for _, dorder := range order.DistributorOrders {
			if dorder.DistributorEmailSaveDefault.Valid && dorder.DistributorEmailSaveDefault.Bool == true {
				_, err = db.Exec("UPDATE distributors SET email=$1, contact_name=$2 WHERE id=$3", dorder.DistributorEmail, dorder.DistributorContactName, dorder.DistributorID)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			} else if dorder.DistributorPhoneSaveDefault.Valid && dorder.DistributorPhoneSaveDefault.Bool == true {
				_, err = db.Exec("UPDATE distributors SET phone=$1, contact_name=$2 WHERE id=$3", dorder.DistributorPhone, dorder.DistributorContactName, dorder.DistributorID)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}
		}

		// get the unique Purchase Order Number.  Do this outside of DoSend check
		// since previews need it too
		po_num := getPurchaseOrderNumForRestaurant(test_restaurant_id)
		order.Order.PO_Num.String = po_num
		order.Order.PO_Num.Valid = true
		sub_nums := "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
		for i, _ := range order.DistributorOrders {
			do_num := order.Order.PO_Num.String + string(sub_nums[i])
			order.DistributorOrders[i].DO_Num.Valid = true
			order.DistributorOrders[i].DO_Num.String = do_num
		}
		// DoSend in this context means save & commit.  Whether we physically send
		// right now is also dependent on order.Order.SendLater being false
		if order.DoSend == true {

			// -----------------------------------------------------------------------
			// Save the entire Purchase Order into history so we can view history in
			// the future
			var restaurant Restaurant
			err := db.QueryRow("SELECT name FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(&restaurant.Name)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			cur_time := time.Now().UTC()
			var po_id int
			err = db.QueryRow(`
				INSERT INTO purchase_orders 
					(restaurant_name, restaurant_id, user_id, created, order_date, sent, 
					purchase_contact, purchase_email, purchase_phone, purchase_fax,
					purchase_cc, 
					addr1, addr2, city, state, zipcode, send_method, po_num) 
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) 
				RETURNING id;`,
				restaurant.Name.String, test_restaurant_id, test_user_id, cur_time,
				order.Order.OrderDate, false, order.Order.PurchaseContact,
				order.Order.PurchaseEmail, order.Order.PurchasePhone, order.Order.PurchaseFax,
				cc_id,
				order.DeliveryAddress.AddressOne, order.DeliveryAddress.AddressTwo,
				order.DeliveryAddress.City, order.DeliveryAddress.State, order.DeliveryAddress.Zipcode,
				order.Order.SendMethod, order.Order.PO_Num).Scan(&po_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			order.Order.ID = int(po_id)

			var order_grand_total float32
			for _, dorder := range order.DistributorOrders {

				var do_id int
				err = db.QueryRow(`
				INSERT INTO distributor_orders 
					(purchase_order_id, distributor_id, distributor, distributor_email, 
					distributor_phone, distributor_contact_name, delivery_date, total, 
					additional_notes, do_num) 
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
					po_id, dorder.DistributorID, dorder.Distributor, dorder.DistributorEmail,
					dorder.DistributorPhone, dorder.DistributorContactName, dorder.DeliveryDate,
					dorder.Total, dorder.AdditionalNotes, dorder.DO_Num).Scan(&do_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}

				for _, item := range dorder.Items {
					_, err = db.Exec(`
					INSERT INTO distributor_order_items 
						(distributor_order_id, beverage_id, batch_cost, quantity, subtotal,
							resolved_subtotal, additional_pricing, additional_pricing_description) 
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
						do_id, item.BeverageID, item.BatchCost, item.Quantity, item.Subtotal,
						item.ResolvedSubtotal, item.AdditionalPricing, item.AdditionalPricingDescription)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} // end for Items

				order_grand_total += dorder.Total
			} // end for DistributorOrders

		} // end if doSend

		if order.Order.SendMethod.String == "email" {
			if order.DoSend == true && order.Order.SendLater == true {
				// if sending later, we don't actually create anything now, we're
				// content with saving the PO in the DB above
			} else {
				createPurchaseOrderPDFFile(test_user_id, test_restaurant_id, order, order.DoSend, order.DoSend, w, r)
			}
		} else if order.Order.SendMethod.String == "text" {
			if order.DoSend == true && order.Order.SendLater == true {
				// if sending later, we don't actually create anything now, we're
				// content with saving the PO in the DB above
			} else {
				createPurchaseOrderSMS(test_user_id, test_restaurant_id, order, order.DoSend, w, r)
			}
		} else if order.Order.SendMethod.String == "save" {
			// Note for saving we never actually "send later", so we don't have
			// additional checks for send later, we always just "save" it now
			// which will mark it as sent, so it doesn't show up in pending POs
			createPurchaseOrderSaveOnly(test_user_id, test_restaurant_id, order, order.DoSend, w, r)
		}

		actually_sent := order.DoSend == true && (order.Order.SendLater == false || order.Order.SendMethod.String == "save")
		if actually_sent {
			// if purchase order had a CC email, send out CC email
			// by setting split_by_dist_order false and do_send true, it will send
			// a single overview pdf to the CC list only
			if len(order.Order.PurchaseCC) > 0 {
				createPurchaseOrderPDFFile(test_user_id, test_restaurant_id, order, false, true, w, r)
			}

			// check if budget was overdrawn and send alert email if necessary
			// if the PO total exceeded the remaining budget, AND there is a
			// contact specified for email alerts, send email alert
			budget, err := getMonthlyBudget(test_restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			if budget.RemainingBudget.Valid && budget.RemainingBudget.Float64 < 0 {
				log.Println("Monthly budget exceeded, sending budget alert!")
				_ = sendBudgetAlert(test_restaurant_id, budget)
			}
		}
	}
}

func sendBudgetAlert(restaurant_id string, budget Budget) error {

	// first see if the restaurant has a purchase_budget_alert_email
	// if it doesn't, quit
	// if it does, send an automated email warning how much budget has been
	// exceeded by

	var alert_email NullString
	err := db.QueryRow(`
		SELECT purchase_budget_alert_email 
		FROM restaurants WHERE id=$1;`, restaurant_id).Scan(&alert_email)
	if err != nil {
		log.Println(err.Error())
		return err
	}

	if alert_email.Valid {

		restaurant_name := getRestaurantName(restaurant_id)

		spent := budget.MonthlyBudget.Float64 - budget.RemainingBudget.Float64
		email_title := restaurant_name + ": Monthly Budget Overdrawn!"
		email_body := fmt.Sprintf(`Your purchases this month have exceeded 
			your monthly budget!<br/><br/>
			Monthly Budget: $ %.2f<br/>
			Purchases to date: $ %.2f<br/>
			Overdrawn by: $ %.2f<br/><br/>
			To view a complete history of Purchase Orders placed this month, check out 
			the PO History page on the app.  To adjust the monthly budget maximum, 
			or to stop receiving this email or change the recipient for budget 
			alerts, visit the Monthly Budget page.`,
			budget.MonthlyBudget.Float64, spent, budget.RemainingBudget.Float64)
		file_location := ""
		file_name := ""
		err = sendAttachmentEmail(alert_email.String, email_title, email_body, file_location, file_name, "")
		if err != nil {
			log.Println(err.Error())
			return err
		}
	}
	return err
}

func getMonthlyBudget(restaurant_id string) (Budget, error) {

	var err error
	var budget Budget
	err = db.QueryRow(`
			SELECT purchase_monthly_budget, purchase_target_run_rate, purchase_budget_alert_email
			FROM restaurants WHERE id=$1;`, restaurant_id).Scan(
		&budget.MonthlyBudget, &budget.TargetRunRate, &budget.BudgetAlertEmail)
	if err != nil {
		log.Println(err.Error())
		return budget, err
	}

	// get the remaining budget.  This is done by getting the sums of all
	// unique distributor orders for the month, then subtracting that
	// from the monthly budget
	//
	// first, select all unique do_num in the distributor_orders table
	// from the start of the month to today

	var total_spent_budget float64
	tz_str, _ := getRestaurantTimeZone(restaurant_id)
	// the date time logic below has been verified to be correct!
	do_rows, err := db.Query(`
			SELECT distributor_orders.id, distributor_orders.do_num, distributor_orders.total 
			FROM distributor_orders, purchase_orders 
			WHERE distributor_orders.purchase_order_id=purchase_orders.id AND 
			purchase_orders.restaurant_id=$1 AND 
			purchase_orders.sent=TRUE AND 
			purchase_orders.order_date < now() AT TIME ZONE 'UTC' AND 
			purchase_orders.order_date > date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE $2 AT TIME ZONE 'UTC';`,
		restaurant_id, tz_str)
	if err != nil {
		log.Println(err.Error())
		return budget, err
	}

	defer do_rows.Close()
	for do_rows.Next() {
		var dorder DistributorOrder
		if err := do_rows.Scan(
			&dorder.ID,
			&dorder.DO_Num,
			&dorder.Total); err != nil {
			log.Println(err.Error())
			continue
		}

		// XXX for each delivery order num, check if its distributor_orders id has
		// a corresponding do_deliveries entry.  If so, use the delivery_invoice
		// there as the amount, otherwise use the do_total as the amount
		var delivery_invoice NullFloat64
		err = db.QueryRow(`
			SELECT delivery_invoice 
			FROM do_deliveries 
			WHERE distributor_order_id=$1;`, dorder.ID).Scan(
			&delivery_invoice)
		switch {
		case err == sql.ErrNoRows:
			delivery_invoice.Valid = false
			err = nil
		case err != nil:
			log.Println(err.Error())
			continue
		}

		if delivery_invoice.Valid {
			total_spent_budget += delivery_invoice.Float64
		} else {
			total_spent_budget += float64(dorder.Total)
		}
	}

	if !budget.MonthlyBudget.Valid {
		budget.RemainingBudget.Valid = false
	} else {
		budget.RemainingBudget.Valid = true
		budget.RemainingBudget.Float64 = budget.MonthlyBudget.Float64 - total_spent_budget
	}

	return budget, err
}

func budgetAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {

	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		user_id := r.URL.Query().Get("user_id")
		var restaurant_id string
		err := db.QueryRow(`
      SELECT restaurant_id 
      FROM restaurant_users WHERE user_id=$1;`, user_id).Scan(&restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		budget, err := getMonthlyBudget(restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&budget)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":

		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		decoder := json.NewDecoder(r.Body)
		var budget Budget
		err := decoder.Decode(&budget)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		var restaurant_id string
		err = db.QueryRow(`
      SELECT restaurant_id 
      FROM restaurant_users WHERE user_id=$1;`, budget.UserID).Scan(&restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if budget.MonthlyBudget.Valid {
			_, err = db.Exec(`
			UPDATE restaurants SET purchase_monthly_budget=$1 WHERE id=$2;`, budget.MonthlyBudget, restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		if budget.TargetRunRate.Valid {
			_, err = db.Exec(`
			UPDATE restaurants SET purchase_target_run_rate=$1 WHERE id=$2;`, budget.TargetRunRate, restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

	case "PUT":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		decoder := json.NewDecoder(r.Body)
		var budget_update BudgetUpdate
		err := decoder.Decode(&budget_update)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		var restaurant_id string
		err = db.QueryRow(`
      SELECT restaurant_id 
      FROM restaurant_users WHERE user_id=$1;`, budget_update.UserID).Scan(&restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		for _, key := range budget_update.ChangeKeys {
			if key == "budget_alert_email" {
				_, err = db.Exec("UPDATE restaurants SET purchase_budget_alert_email=$1 WHERE id=$2", budget_update.Budget.BudgetAlertEmail, restaurant_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
			}
		}
	}
}
