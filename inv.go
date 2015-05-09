package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	//"github.com/lib/pq"
)

type InvSumHistory struct {
	InventorySum float32   `json:"inventory_sum"`
	Date         time.Time `json:"update"`
}

func setupInvHandlers() {
	invHandler := http.FileServer(http.Dir("inventory"))
	http.Handle("/inventory/", http.StripPrefix("/inventory/", invHandler))

	http.HandleFunc("/inv", invAPIHandler)
	http.HandleFunc("/inv/loc", invLocAPIHandler)
	http.HandleFunc("/loc", locAPIHandler)
	http.HandleFunc("/inv/history", invHistoryAPIHandler)
}

func invHistoryAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "GET":
		history_type := r.URL.Query().Get("type")
		log.Println(history_type)

		if history_type == "all" {
			// Because location_beverages only stores one entry per DAY per beverage
			// at each location, summing across all locations on the same day would
			// yield total quantity on that day
			//
			// for each distinct DAY (no hour, min, etc), for each beverage,
			// in all locations, sum quantity * p_cost / p_count

			var histories []InvSumHistory

			rows, err := db.Query("SELECT SUM(beverages.purchase_cost/beverages.purchase_count*location_beverages.quantity), DATE(location_beverages.update) AS update_day FROM beverages,location_beverages WHERE beverages.id=location_beverages.beverage_id AND location_beverages.update > (now() - '1 month'::interval) GROUP BY update_day;")
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var history InvSumHistory
				if err := rows.Scan(
					&history.InventorySum,
					&history.Date); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}

				histories = append(histories, history)
			}

			w.Header().Set("Content-Type", "application/json")
			js, err := json.Marshal(histories)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)
		}

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
}

func invAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "GET":
		var beverages []Beverage

		rows, err := db.Query("SELECT id, container_type, serve_type, distributor, product, brewery, alcohol_type, abv, purchase_volume, purchase_unit, purchase_cost, purchase_count, deposit, flavor_profile FROM beverages WHERE user_id=$1", test_user_id)
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
				&bev.ContainerType,
				&bev.ServeType,
				&bev.Distributor,
				&bev.Product,
				&bev.Brewery,
				&bev.AlcoholType,
				&bev.ABV,
				&bev.PurchaseVolume,
				&bev.PurchaseUnit,
				&bev.PurchaseCost,
				&bev.PurchaseCount,
				&bev.Deposit,
				&bev.FlavorProfile); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			var exists bool
			err := db.QueryRow("SELECT EXISTS (SELECT 1 FROM location_beverages, locations WHERE location_beverages.beverage_id=$1 AND location_beverages.location_id=locations.id AND location_beverages.update=locations.last_update);", bev.ID).Scan(&exists)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if !exists {
				bev.Count = 0
			} else {
				// Now get the total count of this beverage
				err = db.QueryRow("SELECT SUM(location_beverages.quantity) FROM location_beverages, locations WHERE location_beverages.beverage_id=$1 AND location_beverages.location_id=locations.id AND location_beverages.update=locations.last_update;", bev.ID).Scan(&bev.Count)
				switch {
				case err == sql.ErrNoRows:
					bev.Count = 0
				case err != nil:
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}

			beverages = append(beverages, bev)
		}
		// for each beverage want to include the list of sale volume:prices
		for i := range beverages {
			bev := beverages[i]
			rows, err := db.Query("SELECT id, serving_size, serving_unit, serving_price FROM size_prices WHERE beverage_id=$1;", bev.ID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			for rows.Next() {
				var sp SalePrice
				if err := rows.Scan(
					&sp.ID, &sp.Volume, &sp.Unit, &sp.Price); err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				beverages[i].SalePrices = append(beverages[i].SalePrices, sp)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(beverages)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Write(js)

	case "POST":
		log.Println("GOT POST INV")
		decoder := json.NewDecoder(r.Body)
		var bev Beverage
		err := decoder.Decode(&bev)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Println(bev)
		_, err = db.Exec("INSERT INTO beverages(product, container_type, serve_type, distributor, brewery, alcohol_type, abv, purchase_volume, purchase_unit, purchase_cost, purchase_count, deposit, flavor_profile, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);",
			bev.Product, bev.ContainerType, bev.ServeType, bev.Distributor, bev.Brewery, bev.AlcoholType, bev.ABV, bev.PurchaseVolume, bev.PurchaseUnit, bev.PurchaseCost, bev.PurchaseCount, bev.Deposit, bev.FlavorProfile, test_user_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var bev_id int
		err = db.QueryRow("SELECT last_value FROM beverages_id_seq;").Scan(&bev_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		bev.ID = bev_id
		bev.Count = 0
		var validSalePrices []SalePrice // collect only valid sale price entries

		// For each of the SalePrice items, insert entry into size_prices
		for i := range bev.SalePrices {
			salePrice := bev.SalePrices[i]
			// if both Volume and Price are empty, don't add an entry -- it means the
			// user left this blank
			if !salePrice.Volume.Valid && !salePrice.Price.Valid {
				// remove bev.SalePrices[i]
				continue
			}
			_, err = db.Exec("INSERT INTO size_prices(serving_size, serving_unit, serving_price, beverage_id) VALUES($1, $2, $3, $4);", salePrice.Volume, salePrice.Unit, salePrice.Price, bev_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			validSalePrices = append(validSalePrices, salePrice)
		}

		bev.SalePrices = validSalePrices

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		js, err := json.Marshal(&bev)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "PUT":
		log.Println("Received /inv PUT")
		decoder := json.NewDecoder(r.Body)
		var bev_update BeverageUpdate
		err := decoder.Decode(&bev_update)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Println(bev_update.Bev)
		log.Println(bev_update.ChangeKeys)

		// Here's how we update the keys:
		// Any "special" keys not in the beverage table we handle individually
		// Any keys in the beverage table should match the table's keys so
		// we can just insert them
		//
		// First, handle the "special" keys
		// TABLE size_prices
		var doSalePrices bool
		var doBeverage bool
		var beverageUpdateKeys []string
		for _, key := range bev_update.ChangeKeys {
			if key == "size_prices" {
				doSalePrices = true
			} else {
				doBeverage = true
				beverageUpdateKeys = append(beverageUpdateKeys, key)
			}
		}

		bev_id := bev_update.Bev.ID

		if doSalePrices {
			sps := bev_update.Bev.SalePrices
			log.Println("Do sale prices ")

			// First delete any size_prices entries with the beverage ID
			_, err = db.Exec("DELETE FROM size_prices WHERE beverage_id=$1;", bev_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			// Now insert fresh entries for the sale prices
			for _, sp := range sps {
				// if both Volume and Price are empty, don't add an entry -- it means the
				// user left this blank
				if !sp.Volume.Valid && !sp.Price.Valid {
					// remove bev.SalePrices[i]
					continue
				}
				_, err = db.Exec("INSERT INTO size_prices(serving_size, serving_unit, serving_price, beverage_id) VALUES ($1, $2, $3, $4);", sp.Volume, sp.Unit, sp.Price, bev_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}
		}

		if doBeverage {
			log.Println("Do beverage")
			var keys []string
			var values []string

			for _, key := range beverageUpdateKeys {
				keys = append(keys, key)
				if key == "product" {
					values = append(values, "'"+bev_update.Bev.Product+"'")
				} else if key == "container_type" {
					values = append(values, "'"+bev_update.Bev.ContainerType+"'")
				} else if key == "serve_type" {
					values = append(values, fmt.Sprintf("%d", bev_update.Bev.ServeType))
				} else if key == "distributor" {
					values = append(values, "'"+bev_update.Bev.Distributor.String+"'")
				} else if key == "brewery" {
					values = append(values, "'"+bev_update.Bev.Brewery.String+"'")
				} else if key == "alcohol_type" {
					values = append(values, "'"+bev_update.Bev.AlcoholType+"'")
				} else if key == "abv" {
					values = append(values, fmt.Sprintf("%f", bev_update.Bev.ABV.Float64))
				} else if key == "purchase_volume" {
					values = append(values, fmt.Sprintf("%f", bev_update.Bev.PurchaseVolume.Float64))
				} else if key == "purchase_unit" {
					values = append(values, "'"+bev_update.Bev.PurchaseUnit.String+"'")
				} else if key == "purchase_cost" {
					values = append(values, fmt.Sprintf("%f", bev_update.Bev.PurchaseCost))
				} else if key == "purchase_count" {
					values = append(values, fmt.Sprintf("%d", bev_update.Bev.PurchaseCount))
				} else if key == "deposit" {
					values = append(values, fmt.Sprintf("%f", bev_update.Bev.Deposit.Float64))
				} else if key == "flavor_profile" {
					values = append(values, "'"+bev_update.Bev.FlavorProfile.String+"'")
				}
			}

			i := 0
			var keys_string string
			var values_string string
			for _, key := range keys {
				if i > 0 {
					keys_string += ", "
				}
				keys_string += key
				i++
			}
			i = 0
			for _, value := range values {
				if i > 0 {
					values_string += ", "
				}
				values_string += value
				i++
			}
			query := fmt.Sprintf("UPDATE beverages SET (%s) = (%s) WHERE id=%d;", keys_string, values_string, bev_id)
			log.Println(query)
			_, err = db.Exec(query)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
	case "DELETE":
		// XXX verify user is authorized

		bev_id := r.URL.Query().Get("id")

		// First delete all location_beverages which have bev.ID as beverage_id
		_, err := db.Exec("DELETE FROM location_beverages WHERE beverage_id=$1;", bev_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Then delete all size_prices which have beverage_id
		_, err = db.Exec("DELETE FROM size_prices WHERE beverage_id=$1;", bev_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Lastly delete beverages which have beverage_id
		_, err = db.Exec("DELETE FROM beverages WHERE id=$1;", bev_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// XXX In future delete tapped which have beverage_id

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
}

// Adds an inventory item type to a location.
func invLocAPIHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "DELETE":
		loc_name := r.URL.Query().Get("location")
		item_id := r.URL.Query().Get("id")

		post_time := time.Now().UTC()

		// Verify Location exists or quit
		var loc_id int
		err := db.QueryRow("SELECT id FROM locations WHERE user_id=$1 and name=$2;", test_user_id, loc_name).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Verify item exists or quit
		var existing_item_id int
		err = db.QueryRow("SELECT id FROM beverages WHERE user_id=$1 AND id=$2", test_user_id, item_id).Scan(&existing_item_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			log.Println(err.Error())
			return
		}

		var last_update time.Time
		err = db.QueryRow("SELECT last_update FROM locations WHERE id=$1;", loc_id).Scan(&last_update)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}
		cur_year := post_time.Year()
		cur_month := post_time.Month()
		cur_day := post_time.Day()
		last_year := last_update.Year()
		last_month := last_update.Month()
		last_day := last_update.Day()
		same_day := false
		if cur_year == last_year && cur_month == last_month && cur_day == last_day {
			same_day = true
		}

		// For all items that are NOT the item being deleted, update their update
		// time to now (post_time), and update location.last_update to now as well.
		// This will effectively mask the deleted item moving on from this point
		rows, err := db.Query("SELECT beverage_id, location_id, quantity, update FROM location_beverages WHERE location_id=$1 AND update=$2 AND beverage_id!=$3;", loc_id, last_update, existing_item_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var bev LocBeverage
			if err := rows.Scan(
				&bev.BevID,
				&bev.LocID,
				&bev.Quantity,
				&bev.Update); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			_, err = db.Exec("INSERT INTO location_beverages (beverage_id, location_id, quantity, update) VALUES ($1, $2, $3, $4);", bev.BevID, bev.LocID, bev.Quantity, post_time)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
		// if same day, delete old entries of duplicated beverages, but not the
		// deleted beverage, of course
		if same_day == true {
			_, err = db.Exec("DELETE FROM location_beverages WHERE location_id=$1 AND update=$2 AND beverage_id!=$3;", loc_id, last_update, existing_item_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
		// Now set location.last_update to post_time
		_, err = db.Exec("UPDATE locations SET last_update=$1 WHERE id=$2;", post_time, loc_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	case "GET":
		loc_name := r.URL.Query().Get("name")

		var locBevs []LocBeverageApp
		log.Println(loc_name)

		if loc_name == "" {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		// Verify Location exists or quit
		var loc_id int
		err := db.QueryRow("SELECT id FROM locations WHERE user_id=$1 and name=$2;", test_user_id, loc_name).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var last_update time.Time
		err = db.QueryRow("SELECT last_update FROM locations WHERE id=$1;", loc_id).Scan(&last_update)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

		rows, err := db.Query("SELECT beverages.id, beverages.product, beverages.brewery, beverages.alcohol_type, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, location_beverages.quantity, location_beverages.update FROM beverages, location_beverages WHERE beverages.id=location_beverages.beverage_id AND location_beverages.location_id=$1 AND location_beverages.update=$2 ORDER BY beverages.product ASC;", loc_id, last_update)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var locBev LocBeverageApp
			if err := rows.Scan(&locBev.ID, &locBev.Product, &locBev.Brewery, &locBev.AlcoholType, &locBev.PurchaseVolume, &locBev.PurchaseUnit, &locBev.PurchaseCost, &locBev.Quantity, &locBev.Update); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			locBevs = append(locBevs, locBev)
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(locBevs)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":
		// Expects beverage id, location name
		// 1. Get user id
		// 2. If location doesn't exist for user, return an error.  Users should
		//    only be able to add item to location that exists.
		// 2. Find if item name already exists, if not add name to items table
		// 3. Find if unit name already exists, if not add name to units table
		// 4. Find if item_unit already exists, if not add item_id and unit_id to
		//    item_units table
		// 5. Find if location_item_units already exists.  If it does update the
		//    quantity and last_update.
		// 5b. If it didn't exist, add an entry
		log.Println("Received /inv/loc POST")
		decoder := json.NewDecoder(r.Body)
		var locBev LocBeverageApp
		err := decoder.Decode(&locBev)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Println(locBev.ID)
		log.Println(locBev.Location)
		//log.Println(result.Loc)
		//log.Println(result.Quantity)
		//log.Println(result.Price)
		/*
		   if locBev.ID == nil {
		     http.Error(w, "Invalid request", http.StatusBadRequest)
		     return
		   }
		*/
		// Verify Location exists or quit
		var loc_id int
		err = db.QueryRow("SELECT id FROM locations WHERE user_id=$1 and name=$2;", test_user_id, locBev.Location).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var last_update time.Time
		err = db.QueryRow("SELECT last_update FROM locations WHERE id=$1;", loc_id).Scan(&last_update)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

		log.Println("About the check if exists")

		// Verify Beverage exists
		var exists bool
		err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM beverages WHERE user_id=$1 AND id=$2);", test_user_id, locBev.ID).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !exists {
			http.Error(w, "Posted beverage does not exist.", http.StatusInternalServerError)
			return
		}

		post_time := time.Now().UTC()

		// Does LocationBeverage from last_update exist already?
		err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM location_beverages WHERE location_id=$1 AND beverage_id=$2 AND update=$3);", loc_id, locBev.ID, last_update).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
		}
		// doesn't exist yet, means good to add
		if !exists {
			_, err = db.Exec("INSERT INTO location_beverages (beverage_id, location_id, quantity, update) VALUES ($1, $2, $3, $4);", locBev.ID, loc_id, 0, post_time)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			// Now, do the following:
			// 1. For all location_beverages with update == location.last_update, copy
			// entries and set update = post_time.
			// 2. If post_time is the same day as last_update, delete the old entries
			// where update = last_update
			cur_year := post_time.Year()
			cur_month := post_time.Month()
			cur_day := post_time.Day()
			last_year := last_update.Year()
			last_month := last_update.Month()
			last_day := last_update.Day()
			same_day := false
			if cur_year == last_year && cur_month == last_month && cur_day == last_day {
				same_day = true
			}
			rows, err := db.Query("SELECT beverage_id, location_id, quantity, update FROM location_beverages WHERE location_id=$1 AND update=$2;", loc_id, last_update)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var bev LocBeverage
				if err := rows.Scan(
					&bev.BevID,
					&bev.LocID,
					&bev.Quantity,
					&bev.Update); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				_, err = db.Exec("INSERT INTO location_beverages (beverage_id, location_id, quantity, update) VALUES ($1, $2, $3, $4);", bev.BevID, bev.LocID, bev.Quantity, post_time)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}
			if same_day == true {
				_, err = db.Exec("DELETE FROM location_beverages WHERE location_id=$1 AND update=$2;", loc_id, last_update)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}
			// Now set location.last_update to post_time
			_, err = db.Exec("UPDATE locations SET last_update=$1 WHERE id=$2;", post_time, loc_id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			http.Error(w, "Posted beverage exists in location.", http.StatusInternalServerError)
			return
		}
	case "PUT":
		log.Println("Received /inv/loc PUT")
		decoder := json.NewDecoder(r.Body)
		var batch LocBeverageAppBatch
		err := decoder.Decode(&batch)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		// check location exists
		var loc_id int
		err = db.QueryRow("SELECT id FROM locations WHERE user_id=$1 AND name=$2;", test_user_id, batch.Location).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

		// Now check location.last_update.  If it's the same day as the current
		// time, delete any entries in location_beverages with
		// update == location.last_update
		var last_update time.Time
		err = db.QueryRow("SELECT last_update FROM locations WHERE id=$1;", loc_id).Scan(&last_update)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}
		cur_time := time.Now().UTC()
		cur_year := cur_time.Year()
		cur_month := cur_time.Month()
		cur_day := cur_time.Day()
		last_year := last_update.Year()
		last_month := last_update.Month()
		last_day := last_update.Day()
		if cur_year == last_year && cur_month == last_month && cur_day == last_day {
			_, err = db.Exec("DELETE FROM location_beverages WHERE location_id=$1 AND update=$2;", loc_id, last_update)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				return
			}
		}

		// first update location last_update
		_, err = db.Exec("UPDATE locations SET last_update=$1 WHERE id=$2;", cur_time, loc_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

		for i := range batch.Items {
			anItem := batch.Items[i]

			// XXX in future need to check that the posting user's ID matches each
			// item to be updated's user_id

			// check that the item id exists
			var exists bool
			err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM beverages WHERE user_id=$1 AND id=$2);", test_user_id, anItem.ID).Scan(&exists)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			// now update its quantity in location_beverages
			_, err := db.Exec("INSERT INTO location_beverages(beverage_id, location_id, quantity, update) VALUES ($1, $2, $3, $4);", anItem.ID, loc_id, anItem.Quantity, cur_time)
			//_, err := db.Exec("UPDATE location_beverages SET quantity=$1, update=$2 WHERE beverage_id=$3 AND location_id=$4;", anItem.Quantity, time.Now().UTC(), anItem.ID, loc_id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}
		}
		var retLoc Location
		retLoc.LastUpdate = cur_time
		retLoc.Name = batch.Location
		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(retLoc)
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

func locAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "GET":
		var locations []Location

		log.Println(test_user_id)
		rows, err := db.Query("SELECT name, last_update FROM locations WHERE user_id=" + string(test_user_id))
		if err != nil {
			log.Fatal(err)
		}
		defer rows.Close()
		for rows.Next() {
			var loc Location
			if err := rows.Scan(&loc.Name, &loc.LastUpdate); err != nil {
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

		log.Println("Post new location: ")

		var newLoc Location
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&newLoc)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Println(newLoc.Name)
		_, err = db.Exec("INSERT INTO locations(name, last_update, user_id) VALUES ($1, $2, $3);", newLoc.Name, time.Time{}, test_user_id)
		if err != nil {
			log.Println(err.Error())
		}
	case "PUT":
		decoder := json.NewDecoder(r.Body)
		var rename RenameTuple
		err := decoder.Decode(&rename)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Verify Location exists or quit
		var loc_id int
		err = db.QueryRow("SELECT id FROM locations WHERE user_id=$1 and name=$2;", test_user_id, rename.Name).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_, err = db.Exec("UPDATE locations SET name=$1 WHERE id=$2;", rename.NewName, loc_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	case "DELETE":
		// XXX first check user is authenticated to do this

		loc_name := r.URL.Query().Get("location")

		// Verify Location exists or quit
		var loc_id int
		err := db.QueryRow("SELECT id FROM locations WHERE user_id=$1 and name=$2;", test_user_id, loc_name).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// First, delete all inventory items in this location in location_beverages
		_, err = db.Exec("DELETE FROM location_beverages WHERE location_id=$1;", loc_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Next, delete location
		_, err = db.Exec("DELETE FROM locations WHERE id=$1;", loc_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return

	}
}
