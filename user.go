package main

import (
	//	"code.google.com/p/go.crypto/bcrypt"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
)

type User struct {
	ID       int `json:"_id,omitempty"`
	Username string
	Password []byte
	Posts    int
}

type RestaurantInvEmail struct {
	RestaurantID int        `json:"restaurant_id"`
	Email        NullString `json:"email"`
}

type Restaurant struct {
	ID              int            `json:"id"`
	Name            NullString     `json:"name"`
	PurchaseContact NullString     `json:"purchase_contact"`
	PurchaseEmail   NullString     `json:"purchase_email"`
	PurchasePhone   NullString     `json:"purchase_phone"`
	PurchaseFax     NullString     `json:"purchase_fax"`
	PurchaseCC      []EmailContact `json:"purchase_cc"`
	PurchaseCCID    NullInt64      `json:"purchase_cc_id"`
	Timezone        NullString     `json:"timezone"`
}

type RestaurantAddress struct {
	Type       NullString `json:"type"`
	AddressOne NullString `json:"address_one"`
	AddressTwo NullString `json:"address_two"`
	City       NullString `json:"city"`
	State      NullString `json:"state"`
	Zipcode    NullString `json:"zipcode"`
}

type EmailContact struct {
	ID    NullInt64 `json:"id"`
	Email string    `json:"email"`
}

type Dashboard struct {
	TotalBeverages        int         `json:"total_beverages"`
	StapleBeverages       int         `json:"staple_beverages"`
	SeasonalBeverages     int         `json:"seasonal_beverages"`
	InactiveBeverages     int         `json:"inactive_beverages"`
	Beers                 int         `json:"beers"`
	Ciders                int         `json:"ciders"`
	Wines                 int         `json:"wines"`
	Liquors               int         `json:"liquors"`
	NonAlcoholics         int         `json:"non_alcoholics"`
	MarkupAverage         float32     `json:"markup_avg"`
	MarkupBeers           float32     `json:"markup_beers"`
	MarkupCiders          float32     `json:"markup_ciders"`
	MarkupWines           float32     `json:"markup_wines"`
	MarkupLiquors         float32     `json:"markup_liquors"`
	MarkupNonAlcoholics   float32     `json:"markup_non_alcoholics"`
	InventoryDaysAgo      int         `json:"inventory_days_ago"`
	LastInventoryDate     NullTime    `json:"last_inventory_date"`
	LastInventorySum      NullFloat64 `json:"last_inventory_sum"`
	NumInventoryLocations NullInt64   `json:"num_inventory_locations"`
	PurchaseContact       NullString  `json:"purchase_contact"`
	PurchaseMonthlyBudget NullFloat64 `json:"purchase_monthly_budget"`
	LastPurchaseDate      NullTime    `json:"last_purchase_date"`
}

func setupUsersHandlers() {
	http.HandleFunc("/users/inv_email", usersInvEmailAPIHandler)
	// we separate name and purchase because the privilege levels for these differ
	http.HandleFunc("/restaurant/name", restaurantNameAPIHandler)
	http.HandleFunc("/restaurant/address", restaurantAddressAPIHandler)
	http.HandleFunc("/restaurant/purchase", restaurantPurchaseAPIHandler)

	http.HandleFunc("/dashboard", dashboardAPIHandler)

}

func checkUserPrivilege() string {
	// check user_id against restaurant_users to see whether they have
	// privileges to see this admin screen
	var privilege string
	err := db.QueryRow("SELECT privilege FROM restaurant_users WHERE restaurant_id=$1 AND user_id=$2;", test_restaurant_id, test_user_id).Scan(&privilege)
	if err != nil {
		log.Println(err.Error())
		return "error"
	}

	return privilege
}

func hasBasicPrivilege(p string) bool {
	if p != "admin" && p != "basic" {
		return false
	}
	return true
}

func hasAdminPrivilege(p string) bool {
	return p == "admin"
}

func getOrAddContactEmail(email string, restaurant_id int) NullInt64 {

	var exists bool
	var ret_id NullInt64
	ret_id.Valid = false
	ret_id.Int64 = -1
	err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM contact_emails WHERE restaurant_id=$1 AND email=$2);", restaurant_id, email).Scan(&exists)
	if err != nil {
		log.Println(err.Error())
		return ret_id
	}

	if exists == true {
		err := db.QueryRow("SELECT id FROM contact_emails WHERE restaurant_id=$1 AND email=$2;", restaurant_id, email).Scan(&ret_id)
		if err != nil {
			log.Println(err.Error())
			ret_id.Valid = false
		}
		return ret_id
	} else {
		err = db.QueryRow(`
			INSERT INTO contact_emails(email, restaurant_id) 
				VALUES($1, $2) RETURNING id;`,
			email, restaurant_id).Scan(&ret_id)
		if err != nil {
			log.Println(err.Error())
			ret_id.Valid = false
		}
		return ret_id
	}

	return ret_id
}

func restaurantNameAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {
	case "GET":

		restaurant_id := r.URL.Query().Get("restaurant_id")

		// privilege: anyone can GET the restaurant name...

		var restaurant Restaurant
		err := db.QueryRow("SELECT name FROM restaurants WHERE id=$1;", restaurant_id).Scan(&restaurant.Name)
		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&restaurant)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "PUT":
		// privilege: only the admin can post restaurant name
		if !hasAdminPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		var restaurant Restaurant

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&restaurant)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println(restaurant)

		_, err = db.Exec("UPDATE restaurants SET name=$1 WHERE id=$2", restaurant.Name, restaurant.ID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	}
}

func restaurantAddressAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {
	case "GET":
		// privilege: anyone can GET restaurant address

		addr_type := r.URL.Query().Get("type")

		var address RestaurantAddress

		var err error
		if addr_type == "delivery" {
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
		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&address)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":
		// privilege: only the admin can post restaurant name
		if !hasAdminPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		var address RestaurantAddress

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&address)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println(address)

		if address.Type.Valid && address.Type.String == "delivery" {
			_, err = db.Exec("UPDATE restaurants SET delivery_addr1=$1, delivery_addr2=$2, delivery_city=$3, delivery_state=$4, delivery_zipcode=$5 WHERE id=$6", address.AddressOne, address.AddressTwo, address.City, address.State, address.Zipcode, test_restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			_, err = db.Exec("UPDATE restaurants SET addr1=$1, addr2=$2, city=$3, state=$4, zipcode=$5 WHERE id=$6", address.AddressOne, address.AddressTwo, address.City, address.State, address.Zipcode, test_restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}
}

// restaurantAPIHandler is an admin screen, need to check user_id
// and credentials has access to admin info via the restaurant_users table
func restaurantPurchaseAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {
	case "GET":
		// only basic privileged users can access this info
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		var restaurant Restaurant
		err := db.QueryRow("SELECT purchase_contact, purchase_email, purchase_phone, purchase_fax, purchase_cc FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(
			&restaurant.PurchaseContact,
			&restaurant.PurchaseEmail,
			&restaurant.PurchasePhone,
			&restaurant.PurchaseFax,
			&restaurant.PurchaseCCID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if restaurant.PurchaseCCID.Valid {
			var econtact EmailContact
			err = db.QueryRow("SELECT id, email FROM contact_emails WHERE id=$1;", restaurant.PurchaseCCID.Int64).Scan(
				&econtact.ID, &econtact.Email)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			restaurant.PurchaseCC = append(restaurant.PurchaseCC, econtact)
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&restaurant)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "PUT":
		// only basic privileged users can access this info
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		var restaurant Restaurant

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&restaurant)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println(restaurant)

		_, err = db.Exec("UPDATE restaurants SET purchase_contact=$1, purchase_email=$2, purchase_phone=$3, purchase_fax=$4 WHERE id=$5", restaurant.PurchaseContact, restaurant.PurchaseEmail, restaurant.PurchasePhone, restaurant.PurchaseFax, test_restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	}
}

func usersInvEmailAPIHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":

		// XXX In future also replace this with proper authentication
		//restaurant_id := r.URL.Query().Get("restaurant_id")

		var ret_user_email RestaurantInvEmail
		err := db.QueryRow("SELECT inv_email_recipient FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(&ret_user_email.Email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&ret_user_email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":

		// also need to fix test_restaurant_id case here
		var restaurant_email RestaurantInvEmail
		log.Println("Received post")

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&restaurant_email)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		_, err = db.Exec("UPDATE restaurants SET inv_email_recipient=$1 WHERE id=$2", restaurant_email.Email, test_restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	}
}

func dashboardAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {
	case "GET":

		// only basic privileged users can access this info
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		user_id := r.URL.Query().Get("user_id")
		var restaurant_id string
		var privilege string

		err := db.QueryRow(`
			SELECT restaurant_id, privilege 
			FROM restaurant_users WHERE user_id=$1;`, user_id).Scan(&restaurant_id, &privilege)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Beverages:
		// Total number of beverages / average markup
		// Number of staples
		// Number of seasonal
		// Number inactive
		// Active beverages:
		//     Num Beers / average markup
		//     Num Ciders / average markup
		//     Num Wine / average markup
		//     Num Liquor / average markup
		//     Num Non Alcoholic / average markup

		var dash Dashboard
		dash.TotalBeverages = 0
		dash.StapleBeverages = 0
		dash.SeasonalBeverages = 0
		dash.InactiveBeverages = 0
		dash.Beers = 0
		dash.Ciders = 0
		dash.Wines = 0
		dash.Liquors = 0
		dash.NonAlcoholics = 0

		brows, err := db.Query(`
			SELECT id, product, sale_status,  alcohol_type, 
			purchase_cost, purchase_count, purchase_volume, purchase_unit 
			FROM beverages 
			WHERE restaurant_id=$1 AND current=true;`, restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var current_bevs []Beverage
		defer brows.Close()
		for brows.Next() {
			var bev Beverage
			if err := brows.Scan(
				&bev.ID,
				&bev.Product,
				&bev.SaleStatus,
				&bev.AlcoholType,
				&bev.PurchaseCost,
				&bev.PurchaseCount,
				&bev.PurchaseVolume,
				&bev.PurchaseUnit); err != nil {
				log.Println(err.Error())
				continue
			}

			current_bevs = append(current_bevs, bev)
		}

		for _, bev := range current_bevs {
			dash.TotalBeverages += 1
			sale_status := bev.SaleStatus.String
			// by sale status
			if sale_status == "Staple" {
				dash.StapleBeverages += 1
			} else if sale_status == "Seasonal" {
				dash.SeasonalBeverages += 1
			} else {
				dash.InactiveBeverages += 1
			}
			// by type
			if bev.AlcoholType == "Beer" && (sale_status == "Staple" || sale_status == "Seasonal") {
				dash.Beers += 1
			} else if bev.AlcoholType == "Cider" && (sale_status == "Staple" || sale_status == "Seasonal") {
				dash.Ciders += 1
			} else if bev.AlcoholType == "Wine" && (sale_status == "Staple" || sale_status == "Seasonal") {
				dash.Wines += 1
			} else if bev.AlcoholType == "Liquor" && (sale_status == "Staple" || sale_status == "Seasonal") {
				dash.Liquors += 1
			} else if sale_status == "Staple" || sale_status == "Seasonal" {
				dash.NonAlcoholics += 1
			}
		}

		markups, _ := calcMarkupsFromBeverages(current_bevs)
		dash.MarkupAverage = markups["All"]
		dash.MarkupBeers = markups["Beers"]
		dash.MarkupCiders = markups["Ciders"]
		dash.MarkupWines = markups["Wines"]
		dash.MarkupLiquors = markups["Liquors"]
		dash.MarkupNonAlcoholics = markups["NonAlcoholics"]

		// Purchasing:
		// Remaining budget this month
		// monthly budget
		// number of Distributors
		// last PO was sent on which date
		// purchasing contact

		// Inventory
		// last time inventory was done
		// last inventory value
		// number of inventory storage locations
		// graph of weekly inventory

		inv_secs_ago := 0.0
		err = db.QueryRow("SELECT EXTRACT(EPOCH FROM (now() AT TIME ZONE 'UTC' - last_update)) FROM locations WHERE restaurant_id=$1 ORDER BY last_update DESC LIMIT 1;", test_restaurant_id).Scan(&inv_secs_ago)
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
		inv_days_ago := int(inv_secs_ago / 60 / 60 / 24)
		log.Println(inv_days_ago)
		dash.InventoryDaysAgo = inv_days_ago

		tz_str, _ := getRestaurantTimeZone(restaurant_id)
		err = db.QueryRow(`
				SELECT SUM(COALESCE(location_beverages.inventory,0)), (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date AS local_update 
				FROM location_beverages, locations 
				WHERE locations.id=location_beverages.location_id AND locations.restaurant_id=$2 
				GROUP BY local_update ORDER BY local_update DESC LIMIT 1;`, tz_str, restaurant_id).Scan(&dash.LastInventorySum, &dash.LastInventoryDate)
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

		err = db.QueryRow(`
			SELECT COUNT(id) FROM locations 
			WHERE active=TRUE AND type='bev' AND restaurant_id=$1;`, restaurant_id).Scan(&dash.NumInventoryLocations)
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

		err = db.QueryRow("SELECT purchase_contact, purchase_monthly_budget FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(&dash.PurchaseContact, &dash.PurchaseMonthlyBudget)
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

		err = db.QueryRow("SELECT order_date FROM purchase_orders WHERE restaurant_id=$1 ORDER BY order_date DESC LIMIT 1;", test_restaurant_id).Scan(&dash.LastPurchaseDate)
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

		// get last inventory value

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&dash)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	}
}
