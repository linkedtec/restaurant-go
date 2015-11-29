package main

import (
	"database/sql"
	"encoding/json"
	//"fmt"
	"log"
	"net/http"
	"time"
)

type Tap struct {
	ID         int        `json:"id"`
	Name       NullString `json:"name"`
	LastUpdate time.Time  `json:"last_update"`
	Active     bool       `json:"active"`
}

// This is the TapBeverage struct that is communicated to and from the app
type TapBeverageApp struct {
	BevID          int         `json:"beverage_id"`
	TapID          int         `json:"tap_id"`
	Product        string      `json:"product"`
	PurchaseVolume NullFloat64 `json:"purchase_volume"`
	PurchaseUnit   NullString  `json:"purchase_unit"`
	PurchaseCost   float32     `json:"purchase_cost"`
	Deposit        NullFloat64 `json:"deposit"`
	TapTime        time.Time   `json:"tap_time"`
	TapOrUntap     string      `json:"tap_or_untap"`
}

type TapInvBatch struct {
	TapsInv    []LocBeverageApp `json:"taps_inventory"`
	LastUpdate time.Time        `json:"last_update"`
	TotalInv   float32          `json:"total_inventory"`
}

func setupTapsHandlers() {
	http.HandleFunc("/taps", tapsAPIHandler)

	// This handles tapping / untapping functionality for taps
	http.HandleFunc("/taps/bevs", tapsBevsAPIHandler)

	// This, on the other hand, handles inventory / location_beverage functions
	http.HandleFunc("/inv/taps", tapsInvAPIHandler)
}

func tapsInvAPIHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		// 1. Get all active taps in locations which belong to user.
		// 2. Get the most recent locations.last_update from all taps
		// 3. For each tap, if locations.last_update == last_update,
		//    AND there's no untapping between last_update and now,
		//    return row where location_beverages.update == last_update

		var all_taps []Location
		most_recent_update := time.Time{}

		rows, err := db.Query("SELECT id, last_update FROM locations WHERE restaurant_id=$1 AND type='tap' AND active;", test_restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var tap Location
			if err := rows.Scan(
				&tap.ID,
				&tap.LastUpdate); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			if tap.LastUpdate.After(most_recent_update) {
				most_recent_update = tap.LastUpdate
			}
			all_taps = append(all_taps, tap)
		}

		log.Println("new most recent update")
		log.Println(most_recent_update)

		var total_inventory float32

		// Now have most recent locations.last_update from all taps
		// store which taps have inventory in the most recent update, and will
		// ultimately return these to user
		var taps_with_inv []LocBeverageApp
		for i := 0; i < len(all_taps); i++ {
			tap := all_taps[i]
			log.Println(tap)
			// first check this tap's last update matches the most recent update
			// if not, its update is old and not applicable
			if !tap.LastUpdate.Equal(most_recent_update) {
				continue
			}

			/*
				SELECT beverages.id, beverages.product, beverages.container_type, beverages.brewery, distributors.name, beverages.alcohol_type, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, kegs.deposit, location_beverages.quantity, location_beverages.inventory, location_beverages.update, location_beverages.location_id
				FROM beverages
					INNER JOIN location_beverages ON (beverages.id=location_beverages.beverage_id)
					LEFT OUTER JOIN distributors ON (beverages.distributor_id=distributors.id)
					LEFT OUTER JOIN kegs ON (beverages.keg_id=kegs.id)
				WHERE location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active ORDER BY beverages.product ASC;
			*/

			// First need to grab the location_beverages entry for the
			// loc_id with update = last_update.  Since taps can only have one
			// beverage, there should only be one row
			var locBev LocBeverageApp
			err = db.QueryRow("SELECT beverages.id, beverages.product, beverages.container_type, beverages.brewery, distributors.name, beverages.alcohol_type, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, kegs.deposit, location_beverages.quantity, location_beverages.inventory, location_beverages.update, location_beverages.location_id FROM beverages INNER JOIN location_beverages ON (beverages.id=location_beverages.beverage_id) LEFT OUTER JOIN distributors ON (beverages.distributor_id=distributors.id) LEFT OUTER JOIN kegs ON (beverages.keg_id=kegs.id) WHERE location_beverages.type='bev' AND location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active AND location_beverages.type='bev' ORDER BY beverages.product ASC;", tap.ID, most_recent_update).Scan(
				&locBev.ID, &locBev.Product, &locBev.ContainerType, &locBev.Brewery, &locBev.Distributor, &locBev.AlcoholType, &locBev.PurchaseVolume, &locBev.PurchaseUnit, &locBev.PurchaseCost, &locBev.PurchaseCount, &locBev.Deposit, &locBev.Quantity, &locBev.Inventory, &locBev.Update, &locBev.LocationID)
			//err = db.QueryRow("SELECT beverages.id, beverages.product, beverages.container_type, beverages.brewery, beverages.distributor, beverages.alcohol_type, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, beverages.deposit, location_beverages.quantity, location_beverages.inventory, location_beverages.update, location_beverages.location_id FROM beverages, location_beverages WHERE beverages.id=location_beverages.beverage_id AND location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active ORDER BY beverages.product ASC;", tap.ID, most_recent_update).Scan(
			//		&locBev.ID, &locBev.Product, &locBev.ContainerType, &locBev.Brewery, &locBev.Distributor, &locBev.AlcoholType, &locBev.PurchaseVolume, &locBev.PurchaseUnit, &locBev.PurchaseCost, &locBev.PurchaseCount, &locBev.Deposit, &locBev.Quantity, &locBev.Inventory, &locBev.Update, &locBev.LocationID)
			switch {
			case err == sql.ErrNoRows:
				continue
			case err != nil:
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			// Check that the beverage hasn't changed since the last inventory update
			// even if the beverage id is the same, need to check if there was any
			// untapping between the last inventory and now; if so, past entry is no
			// longer valid
			var last_tapped_id int
			err = db.QueryRow("SELECT beverage_id FROM tap_beverages WHERE tap_id=$1 AND tap_or_untap='tap' ORDER BY tap_time DESC LIMIT 1;", tap.ID).Scan(&last_tapped_id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				return
			}
			if last_tapped_id != locBev.ID {
				// the currently tapped beverage is not the same as the last inventory
				// beverage on this tap, so don't return the latter
				continue
			}
			// now check that there have been no untappings in this tap which have
			// occurred after most_recent_update, since that would invalidate the
			// last inventory record
			var was_untapped bool
			err := db.QueryRow("SELECT EXISTS(SELECT * FROM tap_beverages WHERE tap_id=$1 AND tap_or_untap='untap' AND tap_time > $2);", tap.ID, most_recent_update).Scan(&was_untapped)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}
			if was_untapped {
				continue
			}

			total_inventory += float32(locBev.Inventory.Float64)
			log.Println("Printing loc bev")
			log.Println(locBev)
			taps_with_inv = append(taps_with_inv, locBev)
		}

		//var total_inv float32
		//err = db.QueryRow("SELECT SUM(CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume*beverages.purchase_cost/beverages.purchase_count+COALESCE(beverages.deposit,0) ELSE COALESCE(beverages.deposit,0) END) FROM beverages, location_beverages, locations WHERE locations.type='tap' AND beverages.id=location_beverages.beverage_id AND locations.id=location_beverages.location_id AND location_beverages.update=$1;", most_recent_update).Scan(&total_inv)
		//SELECT SUM(COALESCE(location_beverages.inventory, 0)) FROM location_beverages WHERE location_id=$1 AND update=$2 AND active

		var batch TapInvBatch
		batch.TapsInv = taps_with_inv
		batch.LastUpdate = most_recent_update
		batch.TotalInv = total_inventory

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(batch)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":
		// Post: an array of [{id, location_id, quantity}]
		var tap_bevs LocBeverageAppBatch
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&tap_bevs)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Println(tap_bevs.Items)

		cur_time := time.Now().UTC()
		cur_year := cur_time.Year()
		cur_month := cur_time.Month()
		cur_day := cur_time.Day()

		var total_inventory float32
		var return_bevs []LocBeverageApp

		for i := range tap_bevs.Items {
			bev := tap_bevs.Items[i]

			// check location exists
			var loc_exists bool
			err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM locations WHERE restaurant_id=$1 AND id=$2);", test_restaurant_id, bev.LocationID).Scan(&loc_exists)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			// Now check location.last_update.  If it's the same day as the current
			// time, delete any entries in location_beverages with
			// update == location.last_update
			//
			// Note that this is different from the duplicate / update scheme from
			// /inv/loc, but because taps are based on tap/untap rather than the
			// expected list of inventory items in the location, deleting makes sense
			// as in the case where the user has tapped / untapped between taking
			// inventory in the same day
			var last_update time.Time
			err = db.QueryRow("SELECT last_update FROM locations WHERE id=$1;", bev.LocationID).Scan(&last_update)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}

			// XXX in future need to check that the posting user's ID matches each
			// item to be updated's restaurant_id
			// check that the item id exists
			var bev_exists bool
			err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM beverages WHERE restaurant_id=$1 AND id=$2);", test_restaurant_id, bev.ID).Scan(&bev_exists)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			last_year := last_update.Year()
			last_month := last_update.Month()
			last_day := last_update.Day()
			if cur_year == last_year && cur_month == last_month && cur_day == last_day {
				_, err = db.Exec("DELETE FROM location_beverages WHERE location_id=$1 AND update=$2;", bev.LocationID, last_update)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					log.Println(err.Error())
					continue
				}
			}

			// first update tap location last_update
			_, err = db.Exec("UPDATE locations SET last_update=$1 WHERE id=$2;", cur_time, bev.LocationID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}

			// now update its quantity and inventory in location_beverages
			inventory := float32(0)
			unit_cost := float32(0)
			deposit := float32(0)

			err = db.QueryRow("SELECT COALESCE(kegs.deposit, 0) FROM beverages LEFT OUTER JOIN kegs ON (beverages.keg_id=kegs.id) WHERE beverages.id=$1;", bev.ID).Scan(&deposit)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}
			err = db.QueryRow("SELECT CASE WHEN COALESCE(purchase_volume,0)>0 THEN purchase_cost/COALESCE(purchase_count,1)/purchase_volume ELSE 0 END FROM beverages WHERE id=$1;", bev.ID).Scan(&unit_cost)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}
			inventory = float32(bev.Quantity)*unit_cost + deposit
			_, err := db.Exec("INSERT INTO location_beverages(beverage_id, location_id, type, quantity, inventory, update, active) VALUES ($1, $2, 'bev' $3, $4, $5, TRUE);", bev.ID, bev.LocationID, bev.Quantity, inventory, cur_time)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}

			var locBev LocBeverageApp
			locBev.LocationID = bev.LocationID
			locBev.Inventory.Float64 = float64(inventory)
			locBev.Inventory.Valid = true
			return_bevs = append(return_bevs, locBev)

			total_inventory += inventory
		}

		var batch TapInvBatch
		batch.LastUpdate = time.Now().UTC()
		batch.TotalInv = total_inventory
		batch.TapsInv = return_bevs
		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(batch)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return

	}
}

// Adds an inventory item type to a tap.
func tapsBevsAPIHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {

	case "GET":
		// receives a list of tap ids to get
		log.Println(r.URL.Query())
		tap_ids := r.URL.Query()["ids"]

		var tap_bevs []TapBeverageApp

		for tap_i := 0; tap_i < len(tap_ids); tap_i++ {
			tap_id := tap_ids[tap_i]

			// 0. check tap_id exists and belongs to user, if not continue
			// 1. check last update of the tap.  If tap_beverages has an entry with
			// the same tap_time, return that entry
			// 2. otherwise continue, means there's no valid entries
			// 3. Push into an array and return it

			var tap_exists bool
			err := db.QueryRow("SELECT EXISTS(SELECT * FROM locations WHERE restaurant_id=$1 AND id=$2 AND active);", test_restaurant_id, tap_id).Scan(&tap_exists)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				return
			}
			if !tap_exists {
				continue
			}

			var last_update time.Time
			err = db.QueryRow("SELECT last_update FROM taps_last_update WHERE tap_id=$1;", tap_id).Scan(&last_update)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				return
			}

			log.Println(last_update)

			var tapBev TapBeverageApp
			// A note about this query, we order by tap_or_untap ASC so that if
			// there is both an untap and a tap recorded, the tap will be returned

			/*
				SELECT tap_beverages.beverage_id, tap_beverages.tap_id, beverages.product, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, kegs.deposit, tap_beverages.tap_time, tap_beverages.tap_or_untap
				FROM beverages
					INNER JOIN tap_beverages ON (beverages.id=tap_beverages.beverage_id)
					LEFT OUTER JOIN kegs ON (beverages.keg_id=kegs.id)
				WHERE tap_beverages.tap_id=$1 AND tap_beverages.tap_time=$2 ORDER BY tap_or_untap ASC LIMIT 1;
			*/
			err = db.QueryRow("SELECT tap_beverages.beverage_id, tap_beverages.tap_id, beverages.product, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, kegs.deposit, tap_beverages.tap_time, tap_beverages.tap_or_untap FROM beverages INNER JOIN tap_beverages ON (beverages.id=tap_beverages.beverage_id) LEFT OUTER JOIN kegs ON (beverages.keg_id=kegs.id) WHERE tap_beverages.tap_id=$1 AND tap_beverages.tap_time=$2 ORDER BY tap_or_untap ASC LIMIT 1;", tap_id, last_update).Scan(&tapBev.BevID, &tapBev.TapID, &tapBev.Product, &tapBev.PurchaseVolume, &tapBev.PurchaseUnit, &tapBev.PurchaseCost, &tapBev.Deposit, &tapBev.TapTime, &tapBev.TapOrUntap)
			//err = db.QueryRow("SELECT tap_beverages.beverage_id, tap_beverages.tap_id, beverages.product, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, beverages.deposit, tap_beverages.tap_time, tap_beverages.tap_or_untap FROM tap_beverages, beverages WHERE tap_beverages.tap_id=$1 AND tap_beverages.tap_time=$2 AND beverages.id=tap_beverages.beverage_id ORDER BY tap_or_untap ASC LIMIT 1;", tap_id, last_update).Scan(&tapBev.BevID, &tapBev.TapID, &tapBev.Product, &tapBev.PurchaseVolume, &tapBev.PurchaseUnit, &tapBev.PurchaseCost, &tapBev.Deposit, &tapBev.TapTime, &tapBev.TapOrUntap)
			switch {
			case err == sql.ErrNoRows:
				continue
			case err != nil:
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			tap_bevs = append(tap_bevs, tapBev)
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(tap_bevs)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":
		// Expects beverage id, tap id
		// 1. Get user id
		// 2. If tap doesn't exist or doesn't belong to user, return an error.
		//    Users should only be able to add item to location that exists.

		// 5. Find if location_item_units already exists.  If it does update the
		//    quantity and last_update.
		// 5b. If it didn't exist, add an entry
		log.Println("Received /taps/bevs POST")
		decoder := json.NewDecoder(r.Body)
		var tapBev TapBeverageApp
		err := decoder.Decode(&tapBev)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		//log.Println(tapBev.BevID)
		//log.Println(tapBev.TapID)

		// Verify Tap exists or quit
		var tap_exists bool
		err = db.QueryRow("SELECT EXISTS(SELECT * FROM locations WHERE restaurant_id=$1 AND id=$2 AND active);", test_restaurant_id, tapBev.TapID).Scan(&tap_exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		} else if !tap_exists {
			http.Error(w, "Posted tap does not exist.", http.StatusInternalServerError)
			return
		}

		// Verify Beverage exists
		var bev_exists bool
		err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM beverages WHERE restaurant_id=$1 AND id=$2);", test_restaurant_id, tapBev.BevID).Scan(&bev_exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !bev_exists {
			http.Error(w, "Posted beverage does not exist.", http.StatusInternalServerError)
			return
		}

		//post_time := time.Now().UTC()
		//log.Println(post_time)
		//log.Println(tapBev.TapTime)

		// Special case: If untapping, check if there is a tap record with the same
		// beverage on the same tap at the same time.  If there is, delete that
		// tap record and don't record the untapping
		if tapBev.TapOrUntap == "untap" {
			var bev_tapped bool
			err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM tap_beverages WHERE tap_id=$1 AND beverage_id=$2 AND tap_time=$3 AND tap_or_untap='tap');", tapBev.TapID, tapBev.BevID, tapBev.TapTime).Scan(&bev_tapped)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if bev_tapped {
				_, err = db.Exec("DELETE FROM tap_beverages WHERE tap_id=$1 AND beverage_id=$2 AND tap_time=$3 AND tap_or_untap='tap';", tapBev.TapID, tapBev.BevID, tapBev.TapTime)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				// we undid the previous tapping, now quit
				return
			}
		}

		// Add an entry into tap_beverages
		_, err = db.Exec("INSERT INTO tap_beverages (tap_id, beverage_id, tap_time, tap_or_untap, tapper_id) VALUES ($1, $2, $3, $4, $5);", tapBev.TapID, tapBev.BevID, tapBev.TapTime, tapBev.TapOrUntap, test_user_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Finally, if tapBev.TapTime is more recent than taps.last_update, update taps.last_update
		var last_update time.Time
		err = db.QueryRow("SELECT last_update FROM taps_last_update WHERE tap_id=$1;", tapBev.TapID).Scan(&last_update)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

		if tapBev.TapTime.After(last_update) {
			_, err = db.Exec("UPDATE taps_last_update SET last_update=$1 WHERE tap_id=$2", tapBev.TapTime, tapBev.TapID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				return
			}
		}

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return

	}
}

func tapsAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "GET":
		var locations []Location

		rows, err := db.Query("SELECT locations.id, locations.name, taps_last_update.last_update FROM locations, taps_last_update WHERE locations.id=taps_last_update.tap_id AND locations.restaurant_id=$1 AND locations.type='tap' AND locations.active ORDER BY id;", test_restaurant_id)
		if err != nil {
			log.Fatal(err)
		}
		defer rows.Close()
		for rows.Next() {
			var loc Location
			if err := rows.Scan(&loc.ID, &loc.Name, &loc.LastUpdate); err != nil {
				log.Fatal(err)
			}
			locations = append(locations, loc)
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(locations)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":
		log.Println("Post new tap: ")

		var newLoc Location
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&newLoc)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		_, err = db.Exec("INSERT INTO locations(name, last_update, restaurant_id, type, active) VALUES ($1, $2, $3, 'tap', TRUE);", newLoc.Name, time.Time{}, test_restaurant_id)
		if err != nil {
			log.Println(err.Error())
		}

		// for taps, need to additionally insert taps_last_update.last_update
		var tap_id int
		err = db.QueryRow("SELECT last_value FROM locations_id_seq;").Scan(&tap_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		_, err = db.Exec("INSERT INTO taps_last_update(tap_id, last_update) VALUES ($1, $2);", tap_id, time.Time{})
		if err != nil {
			log.Println(err.Error())
		}

		var ret_tap Tap
		ret_tap.ID = tap_id
		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(ret_tap)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	// DELETE has its own /taps API rather than piggy-backing off /loc
	// because it checks special tables such as tap_beverages
	case "DELETE":
		// XXX first check user is authenticated to do this

		tap_id := r.URL.Query().Get("id")

		// Verify Tap exists or quit
		var exists bool
		err := db.QueryRow("SELECT EXISTS (SELECT * FROM locations WHERE id=$1 AND restaurant_id=$2);", tap_id, test_restaurant_id).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !exists {
			http.Error(w, "Deleted tap does not exist.", http.StatusInternalServerError)
			return
		}

		// If there are entries in tap_beverages with tap_id, then just set its
		// active status to false
		// otherwise, delete it entirely since we don't need to preserve its history
		// note that checking if it's been tapped also checks if inventory was ever
		// potentially run (can't run inv without tapping), so don't need to do
		// check in location_beverages
		var has_history bool
		err = db.QueryRow("SELECT EXISTS (SELECT * FROM tap_beverages WHERE tap_id=$1);", tap_id).Scan(&has_history)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !has_history {
			_, err = db.Exec("DELETE FROM taps_last_update WHERE tap_id=$1;", tap_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			_, err = db.Exec("DELETE FROM locations WHERE id=$1;", tap_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			return
		} else {
			_, err = db.Exec("UPDATE locations SET active=FALSE WHERE id=$1", tap_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			return
		}

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return

	}
}
