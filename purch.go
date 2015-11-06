package main

import (
	//"encoding/json"
	//"log"
	"net/http"
	"os"
	//"time"

	//"github.com/jung-kurt/gofpdf"
)

func setupPurchaseOrderHandlers() {
	http.HandleFunc("/purchase", purchaseOrderAPIHandler)
}

func createPurchaseOrderPDFFile(data []byte, sorted_keys []string, suffix string, user_id string, w http.ResponseWriter, r *http.Request, email string, args map[string]string) {

	export_dir := "./export/"
	if os.MkdirAll(export_dir, 0755) != nil {
		http.Error(w, "Unable to find or create export directory!", http.StatusInternalServerError)
		return
	}
}

func purchaseOrderAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {

	case "POST":
		// receives
		//   + restaurant_contact
		//   + contact_email
		//   + contact_phone
		//   + contact_fax
		//   + distributor_orders[]
		//       - distributor_email
		//       - delivery_date
		//       - items[]
		//           + product
		//           + brewery
		//           + batch_cost
		//           + quantity
		//           + subtotal
		//       - delivery_total
		//
		// creates PDF and saves it to /export directory
		// returns PDF to user, which displays on page

	}
}
