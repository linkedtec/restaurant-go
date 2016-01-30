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

func getVolumeInLiters(
	vol NullFloat64, unit NullString, volume_units_map map[string]float32) NullFloat64 {

	var vol_in_liters NullFloat64
	vol_in_liters.Valid = false
	vol_in_liters.Float64 = 0.0

	if !vol.Valid || !unit.Valid {
		return vol_in_liters
	}

	if in_liters, has_unit := volume_units_map[unit.String]; has_unit {
		vol_in_liters.Float64 = float64(in_liters) * vol.Float64
		vol_in_liters.Valid = true
	}

	return vol_in_liters

}

// @vol is the numeric value of volume
// @unit is a string abbreviation of the unit, i.e., oz, qt, L, mL
// @cost is the wholesale cost of the beverage
// @count is the purchase count of the beverage, e.g., if it's sold in a case
// @volume_units_array associates unit abbreviations to volume in liters
//   for converting e.g., oz to mL
// @cost_unit is the volume unit of the returned cost per volume
func getPricePerVolume(
	vol NullFloat64, unit NullString, cost float32,
	count int, volume_units_map map[string]float32,
	cost_unit string) NullFloat64 {

	var price_per_volume NullFloat64
	price_per_volume.Valid = false
	price_per_volume.Float64 = 0

	if vol.Valid == false || unit.Valid == false {
		return price_per_volume
	}

	if vol.Float64 == 0 {
		return price_per_volume
	}

	if count < 1 {
		return price_per_volume
	}

	vol_in_liters := getVolumeInLiters(vol, unit, volume_units_map)
	if !vol_in_liters.Valid {
		return price_per_volume
	}

	cost_per_mL := float64(cost) / float64(count) / vol_in_liters.Float64 / 1000.0

	// if display is cost / mL
	if cost_unit == "mL" {
		// do nothing
	} else if cost_unit == "oz" {
		cost_per_mL *= 29.5735
	}

	price_per_volume.Float64 = cost_per_mL
	price_per_volume.Valid = true

	return price_per_volume
}

func getVolumeUnitsMap() map[string]float32 {
	vumap := make(map[string]float32)

	rows, err := db.Query("SELECT abbr_name, in_liters FROM volume_units;")
	if err != nil {
		log.Println(err.Error())
		return vumap
	}

	defer rows.Close()
	for rows.Next() {
		var abbr_name string
		var in_liters float32
		if err := rows.Scan(
			&abbr_name,
			&in_liters); err != nil {
			continue
		}
		vumap[abbr_name] = in_liters
	}
	return vumap
}

func getMarkupForSalePrice(sp SalePrice, bev Beverage, vumap map[string]float32) NullFloat64 {

	var markup NullFloat64
	markup.Valid = false
	markup.Float64 = 0

	sale_price := sp.Price
	purchase_cost := bev.PurchaseCost
	purchase_count := bev.PurchaseCount
	sale_units := sp.Volume

	if sp.Unit == "Unit" {
		// unit sales are easy, don't need to take volume in count, just get
		// cost per unit, divide sell price per unit by that
		if !sp.Price.Valid || bev.PurchaseCost == 0 || bev.PurchaseCount == 0 || !sale_units.Valid || sale_units.Float64 == 0 {
			return markup
		}

		markup.Float64 = sale_price.Float64 / (float64(purchase_cost) / float64(purchase_count)) / sale_units.Float64
		markup.Valid = true
	} else {
		// to get the markup for a volume pour, we do the following:
		//     get price per volume for wholesale
		//     get price per volume for single sale
		//     price_per_volume_sale / price_per_volume_wholesale = markup
		price_per_volume_wholesale := getPricePerVolume(
			bev.PurchaseVolume,
			bev.PurchaseUnit,
			bev.PurchaseCost,
			bev.PurchaseCount,
			vumap,
			"mL")
		if !price_per_volume_wholesale.Valid {
			return markup
		}

		var _unit NullString
		_unit.Valid = true
		_unit.String = sp.Unit
		price_per_volume_sale := getPricePerVolume(
			sp.Volume,
			_unit,
			float32(sp.Price.Float64),
			1,
			vumap,
			"mL")
		if !price_per_volume_sale.Valid {
			return markup
		}

		markup.Float64 = price_per_volume_sale.Float64 / price_per_volume_wholesale.Float64
		markup.Valid = true
	}

	return markup
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

		vumap := getVolumeUnitsMap()

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

		markup_totals := make(map[string]float64)
		markup_totals["All"] = 0
		markup_totals["Beers"] = 0
		markup_totals["Ciders"] = 0
		markup_totals["Wines"] = 0
		markup_totals["Liquors"] = 0
		markup_totals["NonAlcoholics"] = 0
		num_size_prices := make(map[string]int)
		num_size_prices["All"] = 0
		num_size_prices["Beers"] = 0
		num_size_prices["Ciders"] = 0
		num_size_prices["Wines"] = 0
		num_size_prices["Liquors"] = 0
		num_size_prices["NonAlcoholics"] = 0
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

			// calculate markups, but only for active (Staple, Seasonal) bevs
			if bev.SaleStatus.String == "Staple" || bev.SaleStatus.String == "Seasonal" {
				sprows, err := db.Query("SELECT id, serving_size, serving_unit, serving_price FROM size_prices WHERE beverage_id=$1;", bev.ID)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				for sprows.Next() {
					var sp SalePrice
					if err := sprows.Scan(
						&sp.ID, &sp.Volume, &sp.Unit, &sp.Price); err != nil {
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					markup := getMarkupForSalePrice(sp, bev, vumap)
					log.Println(bev.Product)
					log.Println(markup)
					// only count valid markups.  0 markups will artificially lower the
					// average
					if markup.Valid == true {
						num_size_prices["All"] += 1
						markup_totals["All"] += markup.Float64
						if bev.AlcoholType == "Beer" {
							markup_totals["Beers"] += markup.Float64
							num_size_prices["Beers"] += 1
						} else if bev.AlcoholType == "Cider" {
							markup_totals["Ciders"] += markup.Float64
							num_size_prices["Ciders"] += 1
						} else if bev.AlcoholType == "Wine" {
							markup_totals["Wines"] += markup.Float64
							num_size_prices["Wines"] += 1
						} else if bev.AlcoholType == "Liquor" {
							markup_totals["Liquors"] += markup.Float64
							num_size_prices["Liquors"] += 1
						} else {
							markup_totals["NonAlcoholics"] += markup.Float64
							num_size_prices["NonAlcoholics"] += 1
						}
					}
				}
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

		if num_size_prices["All"] > 0 {
			dash.MarkupAverage = float32(markup_totals["All"] / float64(num_size_prices["All"]))
		}
		if num_size_prices["Beers"] > 0 {
			dash.MarkupBeers = float32(markup_totals["Beers"] / float64(num_size_prices["Beers"]))
		}
		if num_size_prices["Ciders"] > 0 {
			dash.MarkupCiders = float32(markup_totals["Cjders"] / float64(num_size_prices["Ciders"]))
		}
		if num_size_prices["Wines"] > 0 {
			dash.MarkupWines = float32(markup_totals["Wines"] / float64(num_size_prices["Wines"]))
		}
		if num_size_prices["Liquors"] > 0 {
			dash.MarkupLiquors = float32(markup_totals["Liquors"] / float64(num_size_prices["Liquors"]))
		}
		if num_size_prices["NonAlcoholics"] > 0 {
			dash.MarkupNonAlcoholics = float32(markup_totals["NonAlcoholics"] / float64(num_size_prices["NonAlcoholics"]))
		}

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

		err = db.QueryRow("SELECT purchase_contact FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(&dash.PurchaseContact)
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
