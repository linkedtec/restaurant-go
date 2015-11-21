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
	DoSend            bool               `json:"do_send"`
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

type PO_Item struct {
	DistributorOrderID int     `json:"distributor_order_id"`
	BeverageID         int     `json:"beverage_id"`
	BatchCost          float64 `json:"batch_cost"`
	Quantity           float64 `json:"quantity"`
	Subtotal           float64 `json:"subtotal"`
}

type DistributorOrder struct {
	Distributor                 string     `json:"distributor"`
	DistributorID               int        `json:"distributor_id"`
	DistributorEmail            string     `json:"distributor_email"`
	DistributorEmailSaveDefault NullBool   `json:"distributor_email_save_default"`
	DeliveryDate                string     `json:"delivery_date"`
	Items                       []PO_Item  `json:"items"`
	Total                       float32    `json:"total"`
	AdditionalNotes             NullString `json:"additional_notes"`
}

func setupPurchaseOrderHandlers() {
	http.HandleFunc("/purchase", purchaseOrderAPIHandler)
}

//func createPurchaseOrderPDFFile(data []byte, sorted_keys []string, suffix string, user_id string, w http.ResponseWriter, r *http.Request, email string, args map[string]string) {
func createPurchaseOrderPDFFile(user_id string, restaurant_id string, purchase_order PurchaseOrder, do_send bool, w http.ResponseWriter, r *http.Request) {
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

	var address RestaurantAddress

	if purchase_order.Order.DeliveryAddressType == "delivery" {
		err = db.QueryRow("SELECT delivery_addr1, delivery_addr2, delivery_city, delivery_state, delivery_zipcode FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(
			&address.AddressOne,
			&address.AddressTwo,
			&address.City,
			&address.State,
			&address.Zipcode)
	} else {
		err = db.QueryRow("SELECT addr1, addr2, city, state, zipcode FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(
			&address.AddressOne,
			&address.AddressTwo,
			&address.City,
			&address.State,
			&address.Zipcode)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// create a hash from user id as the filename extension
	h := fnv.New32a()
	h.Write([]byte(test_user_id))
	hash := strconv.FormatUint(uint64(h.Sum32()), 10)
	filename := export_dir + "purch_" + hash
	filename = strings.Replace(filename, " ", "_", -1)

	var pdf *gofpdf.Fpdf
	// If we're not sending, we're putting all distributor orders into a single
	// PDF file for review
	if do_send == false {
		// New args:
		// 1: orientationStr (P=Portrait)
		// 2: unitStr
		// 3. sizeStr (page size)
		// 4. fontDirStr
		pdf = gofpdf.New("P", "mm", "A4", "")
		pdf.SetTitle("Purchase Order", false)
	}

	// Iterate through the DistributorOrders, adding a page for each
	for _, dorder := range purchase_order.DistributorOrders {

		// if we're sending to distributors, each distributor
		// order is its own PDF which is emailed
		if do_send == true {
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
		order_date := fmt.Sprintf("Order Date: %s", purchase_order.Order.OrderDate)
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
		pdf.MultiCell(content_width/2.6, 5, address.AddressOne.String, "", "", false)
		if address.AddressTwo.Valid && len(address.AddressTwo.String) > 0 {
			pdf.SetX(-wd)
			pdf.MultiCell(content_width/2.6, 5, address.AddressTwo.String, "", "", false)
		}
		pdf.SetX(-wd)
		pdf.MultiCell(content_width/2.6, 5, fmt.Sprintf("%s, %s %s", address.City.String, address.State.String, address.Zipcode.String), "", "", false)
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
			var bev Beverage
			err := db.QueryRow("SELECT id, version_id, product, brewery, container_type, purchase_volume, purchase_unit, purchase_count FROM beverages WHERE user_id=$1 AND id=$2;", test_user_id, item.BeverageID).Scan(
				&bev.ID,
				&bev.VersionID,
				&bev.Product,
				&bev.Brewery,
				&bev.ContainerType,
				&bev.PurchaseVolume,
				&bev.PurchaseUnit,
				&bev.PurchaseCount)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

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
			pdf.CellFormat(content_width*col_three_width, 7, strconv.FormatFloat(item.BatchCost, 'f', 2, 32), "L", 0, "C", gray_bg, 0, "")
			pdf.CellFormat(content_width*col_four_width, 7, strconv.FormatFloat(item.Subtotal, 'f', 2, 32), "L", 0, "R", gray_bg, 0, "")
			pdf.Ln(7)
			restore_y = pdf.GetY()

			order_total += item.Subtotal
		}

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

		if do_send == true {
			file_location := fmt.Sprintf("%s_%s.pdf", filename, dorder.Distributor)
			err = pdf.OutputFileAndClose(file_location)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			email_title := fmt.Sprintf("New Purchase Order from %s", restaurant.Name.String)
			email_body := fmt.Sprintf("Please review the attached Purchase Order from %s for fulfillment.", restaurant.Name.String)
			file_name := fmt.Sprintf("PurchaseOrder_%s.pdf", restaurant.Name.String)
			err = sendAttachmentEmail(dorder.DistributorEmail, email_title, email_body, file_location, file_name, "application/pdf")
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}

	if do_send == false {
		filename += ".pdf"
		err = pdf.OutputFileAndClose(filename)
		if err != nil {
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

}

func purchaseOrderAPIHandler(w http.ResponseWriter, r *http.Request) {

	privilege := checkUserPrivilege()

	switch r.Method {

	// XXX Just for testing
	case "GET":
		//createPurchaseOrderPDFFile(test_user_id, test_restaurant_id, false, w, r)

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

		// order.DoSend is true only when saving & committing to email Distributors
		// only commit the overwrites if this is the case
		if order.DoSend == true {
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
					_, err = db.Exec("UPDATE distributors SET email=$1 WHERE id=$2", dorder.DistributorEmail, dorder.DistributorID)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						return
					}
				}
			}
		}

		createPurchaseOrderPDFFile(test_user_id, test_restaurant_id, order, order.DoSend, w, r)

	}
}
