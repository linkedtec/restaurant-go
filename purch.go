package main

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	//"time"

	"github.com/jung-kurt/gofpdf"
)

type PurchaseOrder struct {
	Order             PO_Order           `json:"order"`
	DistributorOrders []DistributorOrder `json:"distributor_orders"`
}

type PO_Order struct {
	OrderDate           string     `json:"order_date"`
	PurchaseContact     string     `json:"purchase_contact"`
	PurchaseEmail       string     `json:"purchase_email"`
	PurchasePhone       NullString `json:"purchase_phone"`
	PurchaseFax         NullString `json:"purchase_fax"`
	PurchaseSaveDefault NullBool   `json:"purchase_save_default"`
	DeliveryAddressType string     `json:"delivery_address_type"`
}

type DistributorOrder struct {
	Distributor                 string    `json:"distributor"`
	DistributorID               int       `json:"distributor_id"`
	DistributorEmail            string    `json:"distributor_email"`
	DistributorEmailSaveDefault NullBool  `json:"distributor_email_save_default"`
	DeliveryDate                string    `json:"delivery_date"`
	Items                       []PO_Item `json:"items"`
	Total                       float32   `json:"total"`
}

type PO_Item struct {
	Product string `json:"product"`
	ID      int    `json:"id"`
}

func setupPurchaseOrderHandlers() {
	http.HandleFunc("/purchase", purchaseOrderAPIHandler)
}

//func createPurchaseOrderPDFFile(data []byte, sorted_keys []string, suffix string, user_id string, w http.ResponseWriter, r *http.Request, email string, args map[string]string) {
func createPurchaseOrderPDFFile(user_id string, restaurant_id string, purchase_order PurchaseOrder, w http.ResponseWriter, r *http.Request) {
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

	// create a hash from user id as the filename extension
	h := fnv.New32a()
	h.Write([]byte(test_user_id))
	hash := strconv.FormatUint(uint64(h.Sum32()), 10)
	filename := export_dir + "purch_" + hash + ".pdf"
	filename = strings.Replace(filename, " ", "_", -1)

	// New args:
	// 1: orientationStr (P=Portrait)
	// 2: unitStr
	// 3. sizeStr (page size)
	// 4. fontDirStr
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetTitle("Purchase Order", false)

	// Iterate through the DistributorOrders, adding a page for each
	for _, dorder := range purchase_order.DistributorOrders {

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

		// ------------------------------- Header ------------------------------------
		pdf.SetX(margin_left)
		pdf.Cell(0, 6, restaurant.Name.String)

		pdf.SetFont("helvetica", "B", 22)
		wd := pdf.GetStringWidth("Purchase Order") + margin_right
		pdf.SetX(-wd)
		pdf.Cell(0, 6, "Purchase Order")

		pdf.Ln(8)
		pdf.SetFont("helvetica", "", 12)
		order_date := fmt.Sprintf("Order Date: %s", purchase_order.Order.OrderDate)
		wd = pdf.GetStringWidth(order_date) + margin_right
		pdf.SetX(-wd)
		pdf.Cell(0, 6, order_date)

		// ---------------------- Vendor + Restaurant Addresses ----------------------
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
		pdf.MultiCell(content_width/2.6, 5, dorder.DistributorEmail, "", "", false)

		pdf.SetFont("helvetica", "", 10)
		pdf.SetTextColor(255, 255, 255)
		pdf.Ln(8)
		pdf.CellFormat(content_width/2.6, 6, " DELIVERY DATE", "", 0, "", true, 0, "")
		pdf.Ln(8)
		pdf.SetTextColor(0, 0, 0)
		pdf.SetFont("helvetica", "", 11)
		//delivery_date := fmt.Sprintf("Order Date: %s", purchase_order.Order.OrderDate)
		pdf.MultiCell(content_width/2.6, 5, dorder.DeliveryDate, "", "", false)

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
		pdf.MultiCell(content_width/2.6, 5, "Address 1", "", "", false)
		pdf.SetX(-wd)
		pdf.MultiCell(content_width/2.6, 5, "Address 2", "", "", false)
		pdf.SetX(-wd)
		pdf.MultiCell(content_width/2.6, 5, "City, State, Zipcode", "", "", false)
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
		pdf.CellFormat(content_width*col_one_width, 6, " PRODUCT NAME / DESCRIPTION", "", 0, "", true, 0, "")
		pdf.CellFormat(content_width*col_two_width, 6, " QTY", "L", 0, "C", true, 0, "")
		pdf.CellFormat(content_width*col_three_width, 6, " UNIT PRICE", "L", 0, "C", true, 0, "")
		pdf.CellFormat(content_width*col_four_width, 6, " SUBTOTAL", "L", 0, "R", true, 0, "")
		pdf.Ln(6)

		// Line items
		type LineItem struct {
			Product   string
			Quantity  int
			UnitPrice float64
			Subtotal  float64
		}
		items := []LineItem{
			LineItem{Product: "Case of Red Wine (12 count) / Belenheimer from 1000 leagues under the Ocean", Quantity: 12, UnitPrice: 1.33, Subtotal: 15.96},
			LineItem{Product: "Case of White Wine (12 count) / Belenheimer", Quantity: 10, UnitPrice: 1.2, Subtotal: 12.00},
			LineItem{Product: "Keg of Anchorsteam / Pacific Brewing Co.", Quantity: 2, UnitPrice: 70, Subtotal: 140.00},
		}
		pdf.SetFont("helvetica", "", 11)
		pdf.SetTextColor(0, 0, 0)
		pdf.SetDrawColor(180, 180, 180)
		pdf.SetFillColor(240, 240, 240) // set gray background for odd rows

		for i, item := range items {
			gray_bg := false
			if i%2 == 1 {
				gray_bg = true
			}
			var product string
			product = item.Product
			for pdf.GetStringWidth(product) >= content_width*(col_one_width-0.01) {
				product = product[:len(product)-1]
			}
			pdf.CellFormat(content_width*col_one_width, 7, product, "", 0, "", gray_bg, 0, "")
			pdf.CellFormat(content_width*col_two_width, 7, strconv.Itoa(item.Quantity), "L", 0, "C", gray_bg, 0, "")
			pdf.CellFormat(content_width*col_three_width, 7, strconv.FormatFloat(item.UnitPrice, 'f', 2, 32), "L", 0, "C", gray_bg, 0, "")
			pdf.CellFormat(content_width*col_four_width, 7, strconv.FormatFloat(item.Subtotal, 'f', 2, 32), "L", 0, "R", gray_bg, 0, "")
			pdf.Ln(7)
			restore_y = pdf.GetY()
		}

		restore_y += 12
		pdf.SetY(restore_y)
		bottom_y := restore_y

		// Only show Additional Comments section if any comments exist
		if true {
			pdf.SetFillColor(14, 133, 189) // set blue background
			pdf.SetTextColor(255, 255, 255)
			pdf.SetFont("helvetica", "", 10)
			pdf.CellFormat(content_width*col_one_width, 6, " NOTES & INSTRUCTIONS", "", 0, "", true, 0, "")
			pdf.Ln(8)
			pdf.SetTextColor(0, 0, 0)
			pdf.SetFont("helvetica", "", 11)
			pdf.MultiCell(content_width*(col_one_width-0.01), 5, "Please deliver this order as well as three pounds of Church's Fried Chicken by Monday, as we will be throwing a grand box social and the guests will be extremely hungry.", "", "", false)
			bottom_y = pdf.GetY() - 8
		}

		pdf.SetTextColor(0, 0, 0)
		pdf.SetFont("helvetica", "B", 11)
		pdf.SetY(bottom_y)
		left_x := margin_left + content_width*(col_one_width+col_two_width)
		pdf.SetX(left_x)
		pdf.CellFormat(content_width*col_three_width, 8, "Order Total", "LTB", 0, "L", false, 0, "")
		pdf.CellFormat(content_width*col_four_width, 8, "$ 12,367.96", "RTB", 0, "R", false, 0, "")
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
	}

	err = pdf.OutputFileAndClose(filename)

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

func purchaseOrderAPIHandler(w http.ResponseWriter, r *http.Request) {

	privilege := checkUserPrivilege()

	switch r.Method {

	// XXX Just for testing
	case "GET":
		//createPurchaseOrderPDFFile(test_user_id, test_restaurant_id, w, r)

	case "POST":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		// receives:
		// Order Information:
		//     - order date
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
		//         - item subtotal
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

		// If save default, overwrite restaurant contact info
		if order.Order.PurchaseSaveDefault.Valid && order.Order.PurchaseSaveDefault.Bool == true {
			_, err = db.Exec("UPDATE restaurants SET purchase_contact=$1, purchase_email=$2, purchase_phone=$3, purchase_fax=$4 WHERE id=$5", order.Order.PurchaseContact, order.Order.PurchaseEmail, order.Order.PurchasePhone, order.Order.PurchaseFax, test_restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		for _, dorder := range order.DistributorOrders {
			if dorder.DistributorEmailSaveDefault.Valid && dorder.DistributorEmailSaveDefault.Bool == true {
				_, err = db.Exec("UPDATE distributors SET email=$1 WHERE distributor_id=$2", dorder.DistributorEmail, dorder.DistributorID)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}
		}

		createPurchaseOrderPDFFile(test_user_id, test_restaurant_id, order, w, r)

	}
}
