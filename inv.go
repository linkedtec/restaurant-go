package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	//"github.com/lib/pq"
	"github.com/lib/xlsx"
)

type InvSumHistory struct {
	Inventory NullFloat64 `json:"inventory"`
	Quantity  float32     `json:"quantity"`
	Date      time.Time   `json:"update"`
}

type InvDateItemHistory struct {
	Date      time.Time     `json:"update"`
	Histories []BeverageInv `json:"histories"`
}

type InvItemSumHistory struct {
	Product   NullString      `json:"product"`
	Histories []InvSumHistory `json:"histories"`
}

type InvLocSumHistory struct {
	Location  NullString      `json:"location"`
	Histories []InvSumHistory `json:"histories"`
}

type ExportFile struct {
	URL string `json:"url"`
}

type BeverageInvs []BeverageInv

// ===================================================
// itemized location inventory (also used for type inventory)
type InvLocSumsByDate struct {
	Date         time.Time           `json:"update"`
	LocHistories []InvLocItemHistory `json:"loc_histories"`
}

type InvLocItemHistory struct {
	Location  NullString    `json:"location"`
	Histories []BeverageInv `json:"histories"`
}

func (slice BeverageInvs) Len() int {
	return len(slice)
}

func (slice BeverageInvs) Less(i, j int) bool {
	return slice[i].Product < slice[j].Product
}

func (slice BeverageInvs) Swap(i, j int) {
	slice[i], slice[j] = slice[j], slice[i]
}

// ===================================================
// sorting by time.Time
type timeArr []time.Time

func (t timeArr) Len() int {
	return len(t)
}

func (t timeArr) Less(i, j int) bool {
	return t[i].Before(t[j])
}

func (t timeArr) Swap(i, j int) {
	t[i], t[j] = t[j], t[i]
}

func setupInvHandlers() {
	invHandler := http.FileServer(http.Dir("inventory"))
	http.Handle("/inventory/", http.StripPrefix("/inventory/", invHandler))

	http.HandleFunc("/inv", invAPIHandler)
	http.HandleFunc("/loc", locAPIHandler)
	http.HandleFunc("/inv/loc", invLocAPIHandler)
	http.HandleFunc("/inv/history", invHistoryAPIHandler)
	http.HandleFunc("/export/", exportAPIHandler)
}

func invAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "GET":

		get_type := r.URL.Query().Get("type")
		// if type is "names", only return the names, ids, and container types
		names_only := get_type == "names"
		container_type := r.URL.Query().Get("container_type")

		var beverages []Beverage
		var beverages_light []BeverageLight

		query := "SELECT id, version_id, container_type, serve_type, distributor, product, brewery, alcohol_type, abv, purchase_volume, purchase_unit, purchase_cost, purchase_count, deposit, flavor_profile FROM beverages WHERE user_id=" + test_user_id + " AND current"
		if names_only {
			query = "SELECT id, version_id, container_type, product FROM beverages WHERE user_id=" + test_user_id + " AND current"
		}
		if len(container_type) != 0 {
			query += " AND container_type='" + container_type + "'"
		}

		query += " ORDER BY product;"

		//log.Println(query)
		rows, err := db.Query(query)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		defer rows.Close()
		for rows.Next() {
			var bev_light BeverageLight
			var bev Beverage
			if names_only {
				if err := rows.Scan(
					&bev_light.ID,
					&bev_light.VersionID,
					&bev_light.ContainerType,
					&bev_light.Product); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
			} else {
				if err := rows.Scan(
					&bev.ID,
					&bev.VersionID,
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
			}

			if names_only {
				beverages_light = append(beverages_light, bev_light)
				continue
			}

			// get count of inventory in all (non empty-keg) locations
			var exists bool
			err := db.QueryRow("SELECT EXISTS (SELECT 1 FROM location_beverages, locations WHERE locations.type='bev' AND locations.active AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=$1 AND location_beverages.location_id=locations.id AND location_beverages.update=locations.last_update);", bev.VersionID).Scan(&exists)
			if err != nil {
				log.Println("Error 1")
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			//log.Println(bev.Product)
			if !exists {
				bev.Count = 0
			} else {
				// Now get the total count of this beverage.  Note that we want to find
				// all the version_id that match, in case this beverage was updated
				// recently
				err = db.QueryRow("SELECT SUM(location_beverages.quantity) FROM location_beverages, locations WHERE locations.type='bev' AND locations.active AND location_beverages.location_id=locations.id AND location_beverages.update=locations.last_update AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=$1;", bev.VersionID).Scan(&bev.Count)
				switch {
				case err == sql.ErrNoRows:
					bev.Count = 0
				case err != nil:
					log.Println("Error 2")
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
			}

			// get count of empty kegs in all empty keg locations
			err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM location_beverages, locations WHERE locations.type='kegs' AND locations.active AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=$1 AND location_beverages.location_id=locations.id AND location_beverages.update=locations.last_update);", bev.VersionID).Scan(&exists)
			if err != nil {
				log.Println("Error 3")
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}
			if !exists {
				//bev.EmptyKegs = 0
			} else {
				// Now get the total count of this beverage
				err = db.QueryRow("SELECT SUM(location_beverages.quantity) FROM location_beverages, locations WHERE locations.type='kegs' AND locations.active AND location_beverages.location_id=locations.id AND location_beverages.update=locations.last_update AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=$1;", bev.VersionID).Scan(&bev.EmptyKegs)
				switch {
				case err == sql.ErrNoRows:
					bev.EmptyKegs.Int64 = 0
				case err != nil:
					log.Println("Error 4")
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
			}

			// get total inventory of beverage
			var total_inv NullFloat64
			// Instead of calculating the inventory, just grab the sum of the most
			// recent location_beverages.inventory values
			err = db.QueryRow("SELECT COALESCE(SUM(COALESCE(location_beverages.inventory,0)),0) FROM location_beverages, beverages, locations WHERE beverages.version_id=$1 AND beverages.id=location_beverages.beverage_id AND location_beverages.active AND location_beverages.location_id=locations.id AND locations.active AND location_beverages.update=locations.last_update;", bev.VersionID).Scan(&total_inv)
			if err != nil {
				log.Println("Error 5")
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}
			bev.Inventory = total_inv
			// XXX Old query below, no longer need to use this since we save
			// inventory in location_beverages, but keeping for records.
			/*
						SELECT COALESCE(SUM(res.inv),0) FROM (
							SELECT CASE WHEN locations.type='kegs' THEN SUM(COALESCE(beverages.deposit,0)*location_beverages.quantity)
							            WHEN locations.type='tap' THEN SUM(
				                      	CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume*beverages.purchase_cost/beverages.purchase_count+COALESCE(beverages.deposit,0)
								              	     ELSE COALESCE(beverages.deposit,0)
								              	END)
							            ELSE SUM(beverages.purchase_cost/beverages.purchase_count*location_beverages.quantity+COALESCE(beverages.deposit,0)*location_beverages.quantity)
				             END AS inv FROM beverages, location_beverages, locations WHERE beverages.id=$1 AND beverages.id=location_beverages.beverage_id AND locations.id=location_beverages.location_id AND locations.last_update=location_beverages.update GROUP BY locations.type
				    ) AS res
			*/

			beverages = append(beverages, bev)
		}

		if !names_only {
			// for each beverage want to include the list of sale volume:prices
			for i := range beverages {
				bev := beverages[i]
				rows, err := db.Query("SELECT id, serving_size, serving_unit, serving_price FROM size_prices WHERE beverage_id=$1;", bev.ID)
				if err != nil {
					log.Println("Error 6")
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				for rows.Next() {
					var sp SalePrice
					if err := rows.Scan(
						&sp.ID, &sp.Volume, &sp.Unit, &sp.Price); err != nil {
						log.Println("Error 7")
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					beverages[i].SalePrices = append(beverages[i].SalePrices, sp)
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")

		if names_only {
			js, err := json.Marshal(beverages_light)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)
		} else {
			js, err := json.Marshal(beverages)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)
		}

	case "POST":

		// When posting, generate the beverages.id serial automatically, then
		// copy it over to beverages.version_id, which relates historical records
		// of the same beverage to each other.  Also, set start_date to the
		// current time, and set current to TRUE

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
		cur_time := time.Now().UTC()
		_, err = db.Exec("INSERT INTO beverages(product, container_type, serve_type, distributor, brewery, alcohol_type, abv, purchase_volume, purchase_unit, purchase_cost, purchase_count, deposit, flavor_profile, user_id, start_date, current) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE);",
			bev.Product, bev.ContainerType, bev.ServeType, bev.Distributor, bev.Brewery, bev.AlcoholType, bev.ABV, bev.PurchaseVolume, bev.PurchaseUnit, bev.PurchaseCost, bev.PurchaseCount, bev.Deposit, bev.FlavorProfile, test_user_id, cur_time)
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

		// copy bev id to version_id, which relates historical changes of this
		// beverage to each other.
		_, err = db.Exec("UPDATE beverages SET version_id=$1 WHERE id=$2;", bev_id, bev_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		bev.ID = bev_id
		bev.VersionID = bev_id
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
		var sizePricesChanged bool
		var beverageChanged bool
		var beverageUpdateKeys []string
		for _, key := range bev_update.ChangeKeys {
			if key == "size_prices" {
				sizePricesChanged = true
			} else {
				beverageChanged = true
				beverageUpdateKeys = append(beverageUpdateKeys, key)
			}
		}

		var old_bev_id int
		err = db.QueryRow("SELECT id FROM beverages WHERE current=TRUE AND version_id=(SELECT version_id FROM beverages WHERE id=$1);", bev_update.Bev.ID).Scan(&old_bev_id)
		if err != nil {
			log.Println("Error 0.5")
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// XXX New beverageChanged procedure:
		// Duplicate the existing beverages.id entry into a new beverages.id entry
		// Set the new version_id to the old one's version_id
		// Set the old one's end_date to cur_time
		// Set the new one's start_date to cur_time
		// Set old one's current to false
		// Set new one's current to true
		// If beverageChanged, update the new entry with the changed keys from beverageUpdateKeys
		_, err = db.Exec("INSERT INTO beverages (distributor, product, brewery, alcohol_type, abv, purchase_volume, purchase_cost, purchase_unit, deposit, flavor_profile, user_id, container_type, serve_type, purchase_count, version_id) SELECT distributor, product, brewery, alcohol_type, abv, purchase_volume, purchase_cost, purchase_unit, deposit, flavor_profile, user_id, container_type, serve_type, purchase_count, version_id FROM beverages WHERE id=$1;", old_bev_id)
		if err != nil {
			log.Println("Error 1")
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		log.Println("Old bev id:")
		log.Println(old_bev_id)

		var new_bev_id int
		err = db.QueryRow("SELECT last_value FROM beverages_id_seq;").Scan(&new_bev_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		log.Println("New bev id:")
		log.Println(new_bev_id)

		cur_time := time.Now().UTC()
		_, err = db.Exec("UPDATE beverages SET end_date=$1, current=FALSE where id=$2", cur_time, old_bev_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_, err = db.Exec("UPDATE beverages SET start_date=$1, current=TRUE where id=$2", cur_time, new_bev_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if beverageChanged {
			log.Println("Do beverage")

			for _, key := range beverageUpdateKeys {
				if key == "product" {
					_, err = db.Exec("UPDATE beverages SET product=$1 WHERE id=$2", bev_update.Bev.Product, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "container_type" {
					_, err = db.Exec("UPDATE beverages SET container_type=$1 WHERE id=$2", bev_update.Bev.ContainerType, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "serve_type" {
					_, err = db.Exec("UPDATE beverages SET serve_type=$1 WHERE id=$2", bev_update.Bev.ServeType, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "distributor" {
					_, err = db.Exec("UPDATE beverages SET distributor=$1 WHERE id=$2", bev_update.Bev.Distributor, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "brewery" {
					_, err = db.Exec("UPDATE beverages SET brewery=$1 WHERE id=$2", bev_update.Bev.Brewery, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "alcohol_type" {
					_, err = db.Exec("UPDATE beverages SET alcohol_type=$1 WHERE id=$2", bev_update.Bev.AlcoholType, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "abv" {
					_, err = db.Exec("UPDATE beverages SET abv=$1 WHERE id=$2", bev_update.Bev.ABV, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "purchase_volume" {
					_, err = db.Exec("UPDATE beverages SET purchase_volume=$1 WHERE id=$2", bev_update.Bev.PurchaseVolume, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "purchase_unit" {
					_, err = db.Exec("UPDATE beverages SET purchase_unit=$1 WHERE id=$2", bev_update.Bev.PurchaseUnit, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "purchase_cost" {
					_, err = db.Exec("UPDATE beverages SET purchase_cost=$1 WHERE id=$2", bev_update.Bev.PurchaseCost, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "purchase_count" {
					_, err = db.Exec("UPDATE beverages SET purchase_count=$1 WHERE id=$2", bev_update.Bev.PurchaseCount, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "deposit" {
					_, err = db.Exec("UPDATE beverages SET deposit=$1 WHERE id=$2", bev_update.Bev.Deposit, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "flavor_profile" {
					_, err = db.Exec("UPDATE flavor_profile SET serve_type=$1 WHERE id=$2", bev_update.Bev.FlavorProfile, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				}
			}
		}

		// XXX New SalePrices procedure:
		// if sizePricesChanged, insert new entries from bev_update.Bev.SalePrices
		// into table size_prices, with the new copied beverage_id
		// if not sizePricesChanged, copy all old entries from size_prices with the
		// old beverage_id into new entries with the new beverage_id
		if sizePricesChanged {
			sps := bev_update.Bev.SalePrices
			log.Println("Do sale prices ")

			// Now insert fresh entries for the sale prices
			for _, sp := range sps {
				// if both Volume and Price are empty, don't add an entry -- it means the
				// user left this blank
				if !sp.Volume.Valid && !sp.Price.Valid {
					// remove bev.SalePrices[i]
					continue
				}
				_, err = db.Exec("INSERT INTO size_prices(serving_size, serving_unit, serving_price, beverage_id) VALUES ($1, $2, $3, $4);", sp.Volume, sp.Unit, sp.Price, new_bev_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
			}
		} else {
			// find all old size_prices with old_bev_id
			rows, err := db.Query("SELECT serving_size, serving_unit, serving_price, beverage_id FROM size_prices WHERE beverage_id=$1;", old_bev_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var sp SalePrice
				if err := rows.Scan(
					&sp.Volume,
					&sp.Unit,
					&sp.Price,
					&sp.ID); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				_, err = db.Exec("INSERT INTO size_prices(serving_size, serving_unit, serving_price, beverage_id) VALUES ($1, $2, $3, $4);", sp.Volume, sp.Unit, sp.Price, new_bev_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		var bev BeverageLight
		bev.ID = new_bev_id
		js, err := json.Marshal(&bev)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "DELETE":
		// XXX verify user is authorized

		bev_id := r.URL.Query().Get("id")

		// check version_id of bev_id
		// go through all beverages.id which match version_id
		// check location_beverages and tap_beverages to see if any are referenced as beverage_id
		// if so, just set bev_id current to FALSE and end_date as cur_time
		// otherwise, delete the beverage entirely:
		//   delete any entries in size_prices
		//   delete all beverages with version_id

		var version_id int
		err := db.QueryRow("SELECT version_id FROM beverages WHERE user_id=$1 AND id=$2;", test_user_id, bev_id).Scan(&version_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		has_history := false
		rows, err := db.Query("SELECT id FROM beverages WHERE version_id=$1;", version_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var old_ids []int
		defer rows.Close()
		for rows.Next() {
			var old_id int
			if err := rows.Scan(
				&old_id); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			old_ids = append(old_ids, old_id)
		}
		for i := range old_ids {
			old_id := old_ids[i]
			check_tables := []string{"location_beverages", "tap_beverages"}
			for t_i := range check_tables {
				table_name := check_tables[t_i]
				err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM "+table_name+" WHERE beverage_id=$1);", old_id).Scan(&has_history)
				if err != nil {
					// if query failed will exit here, so loc_id is guaranteed below
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				if has_history == true {
					break
				}
			}
			if has_history == true {
				break
			}
		}
		// if has_history, set bev_id's current to false, and end_date to cur_time
		// else, delete any entries in size_prices and delete all beverages which
		// match any of the old_ids
		if has_history == true {
			cur_time := time.Now().UTC()
			_, err := db.Exec("UPDATE beverages SET current=FALSE, end_date=$1 WHERE id=$2;", cur_time, bev_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			for i := range old_ids {
				old_id := old_ids[i]
				_, err := db.Exec("DELETE FROM size_prices WHERE beverage_id=$1;", old_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				_, err = db.Exec("DELETE FROM beverages WHERE id=$1;", old_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}
		}

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
}

func locAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "GET":

		loc_type := r.URL.Query().Get("type")

		var locations []Location

		log.Println(test_user_id)
		rows, err := db.Query("SELECT id, name, last_update FROM locations WHERE user_id=$1 AND type=$2 AND active ORDER BY id;", test_user_id, loc_type)
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

		log.Println("Post new location: ")

		var newLoc Location
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&newLoc)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		_, err = db.Exec("INSERT INTO locations(name, last_update, user_id, type, active) VALUES ($1, $2, $3, $4, TRUE);", newLoc.Name, time.Time{}, test_user_id, newLoc.Type)
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
		err = db.QueryRow("SELECT id FROM locations WHERE user_id=$1 AND name=$2 AND type=$3;", test_user_id, rename.Name, rename.Type).Scan(&loc_id)
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
		loc_type := r.URL.Query().Get("type")

		// Verify Location exists or quit
		var loc_id int
		err := db.QueryRow("SELECT id FROM locations WHERE user_id=$1 AND name=$2 AND type=$3;", test_user_id, loc_name, loc_type).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		has_history := false
		check_tables := map[string]string{
			"location_beverages": "location_id",
			"tap_beverages":      "tap_id",
			"taps_last_update":   "tap_id",
		}
		for table, column := range check_tables {
			err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM "+table+" WHERE "+column+"=$1);", loc_id).Scan(&has_history)
			if err != nil {
				// if query failed will exit here, so loc_id is guaranteed below
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if has_history == true {
				break
			}
		}

		// if there is history, simply set the locations.active to false
		if has_history {
			_, err = db.Exec("UPDATE locations SET active=FALSE WHERE id=$1;", loc_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			// If there isn't history, straight up delete location entry
			_, err = db.Exec("DELETE FROM locations WHERE id=$1;", loc_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

		}

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return

	}
}

// responsible for serving exported downloadable files (such as spreadsheets)
// to user.  Expects r.URL to contain the filename, e.g., /export/myfile.txt
func exportAPIHandler(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Path[len("/export/"):]
	http.ServeFile(w, r, "export/"+filename)
}

func createXlsxFile(data []byte, sorted_keys []string, history_type string, suffix string, user_id string, w http.ResponseWriter, r *http.Request) {

	export_dir := "./export/"
	if os.MkdirAll(export_dir, 0755) != nil {
		http.Error(w, "Unable to find or create export directory!", http.StatusInternalServerError)
		return
	}

	// create a hash from user id as the filename extension
	h := fnv.New32a()
	h.Write([]byte(test_user_id))
	hash := strconv.FormatUint(uint64(h.Sum32()), 10)
	filename := export_dir + "history_" + suffix + hash + ".xlsx"
	filename = strings.Replace(filename, " ", "_", -1)

	xfile := xlsx.NewFile()
	sheet := xfile.AddSheet("Sheet1")
	// create headers
	row := sheet.AddRow()
	cell := row.AddCell()
	cell = row.AddCell()
	cell.Value = "Product"
	cell = row.AddCell()
	cell.Value = "Quantity"
	cell = row.AddCell()
	cell.Value = "Inventory"

	nr := bytes.NewReader(data)
	decoder := json.NewDecoder(nr)

	/* //xlsx style support currently not working, issue tracked on github:
	//https://github.com/tealeg/xlsx/issues/84
	boldFont := xlsx.DefaulFont()
	boldFont.Bold = true
	boldStyle := xlsx.NewStyle()
	boldStyle.Font = *boldFont
	*/

	switch history_type {
	case "all_itemized":
		var itemsByDate []InvDateItemHistory
		//var dateInvMap map[string][]BeverageInv
		err := decoder.Decode(&itemsByDate)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		//log.Println(dateInvMap)
		//log.Println(sorted_keys)

		for _, key := range sorted_keys {
			// each key is a date
			daterow := sheet.AddRow()
			cell = daterow.AddCell()
			//cell.SetStyle(boldStyle)
			key_date := strings.Split(key, " ")[0]
			cell.Value = key_date // the date, e.g., 2015-01-01
			daterow.AddCell()
			daterow.AddCell()
			date_sum_cell := daterow.AddCell()

			var dateItem InvDateItemHistory
			for _, item := range itemsByDate {
				item_date := strings.Split(item.Date.String(), " ")[0]
				if item_date == key_date {
					dateItem = item
					break
				}
			}
			date_inv_sum := 0.0

			for _, bevInv := range dateItem.Histories {
				bevrow := sheet.AddRow()
				cell = bevrow.AddCell()
				cell = bevrow.AddCell()
				cell.Value = bevInv.Product
				cell = bevrow.AddCell()
				cell.Value = fmt.Sprintf("%.2f", bevInv.Quantity)
				cell = bevrow.AddCell()
				cell.Value = fmt.Sprintf("%.2f", bevInv.Inventory.Float64)
				date_inv_sum += bevInv.Inventory.Float64
			}

			date_sum_cell.Value = fmt.Sprintf("%.2f", date_inv_sum)
			sheet.AddRow() // add empty row to separate dates
		}
	case "loc_itemized", "type_itemized":
		var allDateInvs []InvLocSumsByDate
		err := decoder.Decode(&allDateInvs)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		//log.Println(allDateInvs)
		//log.Println(sorted_keys)

		for _, key := range sorted_keys {
			// each key is a date string
			daterow := sheet.AddRow()
			cell = daterow.AddCell()
			//cell.SetStyle(boldStyle)
			key_date := strings.Split(key, " ")[0]
			cell.Value = key_date // the date, e.g., 2015-01-01
			daterow.AddCell()
			daterow.AddCell()
			date_sum_cell := daterow.AddCell()

			var aDateInv InvLocSumsByDate
			for _, ainv := range allDateInvs {
				ainv_date := strings.Split(ainv.Date.String(), " ")[0]
				if ainv_date == key_date {
					aDateInv = ainv
					break
				}
			}
			date_inv_sum := 0.0
			for _, locHistory := range aDateInv.LocHistories {
				locrow := sheet.AddRow()
				cell = locrow.AddCell()
				cell.Value = locHistory.Location.String
				cell = locrow.AddCell()
				cell = locrow.AddCell()
				loc_inv_sum_cell := locrow.AddCell()
				loc_inv_sum := 0.0
				for _, itemHistory := range locHistory.Histories {
					itemrow := sheet.AddRow()
					cell = itemrow.AddCell()
					cell = itemrow.AddCell()
					cell.Value = itemHistory.Product
					cell = itemrow.AddCell()
					cell.Value = fmt.Sprintf("%.2f", itemHistory.Quantity)
					cell = itemrow.AddCell()
					cell.Value = fmt.Sprintf("%.2f", itemHistory.Inventory.Float64)
					loc_inv_sum += itemHistory.Inventory.Float64
				}
				loc_inv_sum_cell.Value = fmt.Sprintf("%.2f", loc_inv_sum)
				date_inv_sum += loc_inv_sum
			}
			date_sum_cell.Value = fmt.Sprintf("%.2f", date_inv_sum)
			sheet.AddRow() // add empty row to separate dates
		}
	}

	err := xfile.Save(filename)
	if err != nil {
		log.Println(err.Error())
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

func invHistoryAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "GET":
		history_type := r.URL.Query().Get("type")
		start_date := r.URL.Query().Get("start_date")
		end_date := r.URL.Query().Get("end_date")
		// if export is set, that means return a save-able file instead of JSON
		export := r.URL.Query().Get("export")
		log.Println(history_type)

		// if no dates were provided, set start date to 1 month ago and end date
		// to now
		if len(start_date) == 0 || len(end_date) == 0 {
			start_date = time.Now().UTC().String()
			// 1 month ago
			end_date = time.Now().AddDate(0, -1, 0).UTC().String()
		}

		if history_type == "all_sum" {
			// Because location_beverages only stores one entry per DAY per beverage
			// at each location, summing across all locations on the same day would
			// yield total quantity on that day
			//
			// for each distinct DAY (no hour, min, etc), for each beverage,
			// in all locations, sum quantity * p_cost / p_count

			var histories []InvSumHistory
			/*
				// XXX this is old logic, which is correct, but incurs a lot of calculation
				// The new query uses saved location_beverages.inventory to get inventory
				// a lot faster.
				rows, err := db.Query(
					`SELECT SUM(res.inv), res.update FROM (
					  SELECT CASE WHEN locations.type='kegs' THEN SUM(COALESCE(beverages.deposit,0)*location_beverages.quantity)
					              WHEN locations.type='tap' THEN SUM(
					              	CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume*beverages.purchase_cost/beverages.purchase_count+COALESCE(beverages.deposit,0)
					              	     ELSE COALESCE(beverages.deposit,0)
					              	END)
					              ELSE SUM(beverages.purchase_cost/beverages.purchase_count*location_beverages.quantity+COALESCE(beverages.deposit,0)*location_beverages.quantity)
					         END AS inv, location_beverages.update::date AS update
					         FROM location_beverages, beverages, locations WHERE location_beverages.beverage_id=beverages.id AND locations.id=location_beverages.location_id AND location_beverages.update > (now() - '1 month'::interval) GROUP BY update, locations.type
					) AS res GROUP BY res.update ORDER BY res.update;`)
			*/
			// XXX Not sure need locations.active or location_beverages.active in the query since this is historical view
			rows, err := db.Query("SELECT SUM(COALESCE(location_beverages.inventory,0)), location_beverages.update::date FROM location_beverages, locations WHERE location_beverages.update >= $1::date AND location_beverages.update <= $2::date AND locations.id=location_beverages.location_id AND locations.user_id=$3 GROUP BY location_beverages.update::date ORDER BY location_beverages.update::date;", start_date, end_date, test_user_id)
			if err != nil {
				log.Println("hi")
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var history InvSumHistory
				if err := rows.Scan(
					&history.Inventory,
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

		} else if history_type == "loc_sum" {

			var histories []InvLocSumHistory

			// First get all locations, but omit taps
			loc_rows, err := db.Query("SELECT DISTINCT locations.id, locations.name FROM location_beverages, locations WHERE locations.user_id=$1 AND location_beverages.location_id=locations.id AND locations.type!='tap';", test_user_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer loc_rows.Close()
			for loc_rows.Next() {
				var loc Location
				if err := loc_rows.Scan(
					&loc.ID,
					&loc.Name); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				var sumHistories []InvSumHistory
				var locSumHistory InvLocSumHistory
				locSumHistory.Location = loc.Name

				/*
									rows, err := db.Query(
										`SELECT SUM(res.inv), res.update FROM (
					            SELECT
					              CASE WHEN locations.type='kegs' THEN SUM(COALESCE(beverages.deposit,0)*location_beverages.quantity)
					              ELSE SUM(beverages.purchase_cost/beverages.purchase_count*location_beverages.quantity+COALESCE(beverages.deposit,0)*location_beverages.quantity)
					              END AS inv, location_beverages.update::date AS update
					              FROM beverages,location_beverages,locations
					              WHERE beverages.id=location_beverages.beverage_id AND location_beverages.update > (now() - '1 month'::interval) AND locations.id=location_beverages.location_id AND locations.id=$1 GROUP BY update, locations.type
					          ) AS res GROUP BY res.update ORDER BY res.update;`, loc.ID)
				*/
				rows, err := db.Query("SELECT SUM(COALESCE(location_beverages.inventory,0)), location_beverages.update::date FROM locations, location_beverages WHERE locations.id=$1 AND location_beverages.location_id=locations.id AND location_beverages.update >= $2::date AND location_beverages.update <= $3::date GROUP BY location_beverages.update::date ORDER BY location_beverages.update::date;", loc.ID, start_date, end_date)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				defer rows.Close()
				for rows.Next() {
					var history InvSumHistory
					if err := rows.Scan(
						&history.Inventory,
						&history.Date); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}

					sumHistories = append(sumHistories, history)
				}
				locSumHistory.Histories = sumHistories
				histories = append(histories, locSumHistory)
			}

			// ------------------------ TAPS --------------------------
			// now treat all taps as a single location
			var sumHistories []InvSumHistory
			var locSumHistory InvLocSumHistory
			locSumHistory.Location.String = "All Taps"
			locSumHistory.Location.Valid = true

			rows, err := db.Query("SELECT SUM(COALESCE(location_beverages.inventory,0)), location_beverages.update::date FROM locations, location_beverages WHERE locations.type='tap' AND location_beverages.location_id=locations.id AND location_beverages.update >= $1::date AND location_beverages.update <= $2::date AND locations.user_id=$3 GROUP BY location_beverages.update::date ORDER BY location_beverages.update::date;", start_date, end_date, test_user_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var history InvSumHistory
				if err := rows.Scan(
					&history.Inventory,
					&history.Date); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}

				sumHistories = append(sumHistories, history)
			}
			locSumHistory.Histories = sumHistories
			histories = append(histories, locSumHistory)

			w.Header().Set("Content-Type", "application/json")
			js, err := json.Marshal(histories)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)
		} else if history_type == "type_sum" {

			// piggy back off the loc struct, use Location as Type
			var histories []InvLocSumHistory

			// First get all locations, but omit taps
			type_rows, err := db.Query("SELECT DISTINCT beverages.alcohol_type FROM beverages, location_beverages, locations WHERE location_beverages.update>=$1::date AND location_beverages.update<=$2::date AND locations.id=location_beverages.location_id AND locations.user_id=$3 AND beverages.id=location_beverages.beverage_id ORDER BY beverages.alcohol_type ASC;", start_date, end_date, test_user_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer type_rows.Close()
			for type_rows.Next() {
				var atype string
				if err := type_rows.Scan(
					&atype); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				var sumHistories []InvSumHistory
				var locSumHistory InvLocSumHistory
				locSumHistory.Location.String = atype
				locSumHistory.Location.Valid = true

				/*
									rows, err := db.Query(
										`SELECT SUM(res.inv), res.update FROM (
					            SELECT
					              CASE WHEN locations.type='kegs' THEN SUM(COALESCE(beverages.deposit,0)*location_beverages.quantity)
					              ELSE SUM(beverages.purchase_cost/beverages.purchase_count*location_beverages.quantity+COALESCE(beverages.deposit,0)*location_beverages.quantity)
					              END AS inv, location_beverages.update::date AS update
					              FROM beverages,location_beverages,locations
					              WHERE beverages.id=location_beverages.beverage_id AND location_beverages.update > (now() - '1 month'::interval) AND locations.id=location_beverages.location_id AND locations.id=$1 GROUP BY update, locations.type
					          ) AS res GROUP BY res.update ORDER BY res.update;`, loc.ID)
				*/
				rows, err := db.Query("SELECT SUM(COALESCE(location_beverages.inventory,0)), location_beverages.update::date FROM beverages, location_beverages WHERE beverages.alcohol_type=$1 AND location_beverages.beverage_id=beverages.id AND location_beverages.update>=$2::date AND location_beverages.update<=$3::date GROUP BY location_beverages.update::date ORDER BY location_beverages.update::date;", atype, start_date, end_date)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				defer rows.Close()
				for rows.Next() {
					var history InvSumHistory
					if err := rows.Scan(
						&history.Inventory,
						&history.Date); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}

					sumHistories = append(sumHistories, history)
				}
				locSumHistory.Histories = sumHistories
				histories = append(histories, locSumHistory)
			}

			w.Header().Set("Content-Type", "application/json")
			js, err := json.Marshal(histories)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)

		} else if history_type == "items" {

			// XXX A note here:
			// It is much easier for the client application to return the data sorted
			// first order by beverage using InvItemSumHistory.
			// However, for creating a spreadsheet, it is much easier for the server
			// createXlsxFile function to have the data sorted first order by date.
			// Hence, depending on whether 'export' is specified by the user,
			// the following code will implement different data results.

			item_ids := r.URL.Query()["ids"]

			if len(export) > 0 {
				// XXX can't just append to string, need to check ids are valid integers
				// or subject to injection attack.  Fix in future.
				var id_ints []int
				for _, id := range item_ids {
					id64, _ := strconv.ParseInt(id, 10, 0)
					idi := int(id64)
					id_ints = append(id_ints, idi)
				}

				var dates timeArr
				var sorted_keys []string

				for _, id := range id_ints {
					rows, err := db.Query("SELECT DISTINCT location_beverages.update::date FROM location_beverages, locations WHERE location_beverages.update>=$1::date AND location_beverages.update<=$2::date AND locations.id=location_beverages.location_id AND locations.user_id=$3 AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=(SELECT version_id FROM beverages WHERE id=$4) ORDER BY update::date ASC;", start_date, end_date, test_user_id, id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					defer rows.Close()
					for rows.Next() {
						var adate time.Time
						if err := rows.Scan(&adate); err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							continue
						}
						date_exists := false
						for _, existing_date := range dates {
							if existing_date == adate {
								date_exists = true
								break
							}
						}
						if !date_exists {
							dates = append(dates, adate)
						}
					}
				}
				sort.Sort(dates)
				for _, adate := range dates {
					sorted_keys = append(sorted_keys, adate.String())
				}

				log.Println(sorted_keys)

				var itemsByDate []InvDateItemHistory

				for _, a_date := range dates {
					var itemInv InvDateItemHistory
					itemInv.Date = a_date
					for _, id := range id_ints {
						rows, err := db.Query("SELECT beverages.id, beverages.product, COALESCE(SUM(CASE WHEN locations.type='tap' THEN CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume ELSE 0 END ELSE location_beverages.quantity END),0), COALESCE(SUM(location_beverages.inventory),0) FROM beverages, location_beverages, locations WHERE location_beverages.update::date=$1::date AND location_beverages.beverage_id=beverages.id AND location_beverages.location_id=locations.id AND locations.user_id=$2 AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=(SELECT version_id FROM beverages WHERE id=$3) GROUP BY beverages.id ORDER BY beverages.product ASC;", a_date, test_user_id, id)
						if err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							return
						}

						defer rows.Close()
						for rows.Next() {
							var bevInv BeverageInv
							if err := rows.Scan(
								&bevInv.ID,
								&bevInv.Product,
								&bevInv.Quantity,
								&bevInv.Inventory); err != nil {
								log.Println(err.Error())
								http.Error(w, err.Error(), http.StatusInternalServerError)
								continue
							}
							log.Println(bevInv)
							itemInv.Histories = append(itemInv.Histories, bevInv)
						}
					}
					itemsByDate = append(itemsByDate, itemInv)
				}
				log.Println(itemsByDate)

				js, err := json.Marshal(itemsByDate)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}

				switch export {
				case "xlsx":
					log.Println("create xlsx")
					createXlsxFile(js, sorted_keys, "all_itemized", "items_", test_user_id, w, r)
				}

			} else {
				var item_histories []InvItemSumHistory

				for _, item_id := range item_ids {

					var item InvItemSumHistory

					var product NullString
					err := db.QueryRow("SELECT product FROM beverages WHERE id=$1;", item_id).Scan(&product)
					if err != nil {
						log.Println(err.Error())
						// if query failed will exit here, so loc_id is guaranteed below
						http.Error(w, err.Error(), http.StatusInternalServerError)
						return
					}
					item.Product = product
					log.Println(item)

					var histories []InvSumHistory
					//SELECT SUM(COALESCE(location_beverages.inventory,0)), location_beverages.update::date FROM locations, location_beverages WHERE location_beverages.location_id=locations.id AND location_beverages.update > (now() - '1 month'::interval) GROUP BY location_beverages.update::date ORDER BY location_beverages.update::date;
					/*
									rows, err := db.Query(
										`SELECT SUM(res.inv), res.update FROM (
						          SELECT CASE WHEN locations.type='kegs' THEN SUM(COALESCE(beverages.deposit,0)*location_beverages.quantity)
						                      WHEN locations.type='tap' THEN SUM(
						                      	CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume*beverages.purchase_cost/beverages.purchase_count+COALESCE(beverages.deposit,0)
										              	     ELSE COALESCE(beverages.deposit,0)
										              	END)
						                      ELSE SUM(beverages.purchase_cost/beverages.purchase_count*location_beverages.quantity+COALESCE(beverages.deposit,0)*location_beverages.quantity)
						                    END AS inv, location_beverages.update::date AS update
						                    FROM beverages, location_beverages, locations WHERE beverages.id=$1 AND beverages.id=location_beverages.beverage_id AND locations.id=location_beverages.location_id GROUP BY update, locations.type
						        ) AS res GROUP BY res.update ORDER BY res.update;`, item_id)
					*/

					rows, err := db.Query("SELECT SUM(COALESCE(location_beverages.inventory,0)), COALESCE(SUM(CASE WHEN locations.type='tap' THEN CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume ELSE 0 END ELSE location_beverages.quantity END),0), location_beverages.update::date FROM location_beverages, locations, beverages WHERE location_beverages.location_id=locations.id AND location_beverages.beverage_id=beverages.id AND location_beverages.update >= $1::date AND location_beverages.update <= $2::date AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=(SELECT version_id FROM beverages WHERE id=$3) AND locations.user_id=$4 GROUP BY beverages.id, location_beverages.update::date ORDER BY location_beverages.update::date;", start_date, end_date, item_id, test_user_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						return
					}
					defer rows.Close()
					for rows.Next() {
						var history InvSumHistory
						if err := rows.Scan(
							&history.Inventory,
							&history.Quantity,
							&history.Date); err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							continue
						}
						histories = append(histories, history)
					}
					item.Histories = histories
					item_histories = append(item_histories, item)
				}
				log.Println(item_histories)

				js, err := json.Marshal(item_histories)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				w.Write(js)
			}

		} else if history_type == "all_itemized" {
			// Select itemized inventory list from a given date (range)
			// Create a map with beverage id as key
			// Select all SUM(location_beverages.inventory) grouped by beverage_id
			// with update in the date range.

			log.Println("Printing date")
			log.Println(start_date)
			log.Println(end_date)

			var dates []time.Time
			var sorted_keys []string
			rows, err := db.Query("SELECT DISTINCT location_beverages.update::date FROM location_beverages, locations WHERE location_beverages.update>=$1::date AND location_beverages.update<=$2::date AND locations.id=location_beverages.location_id AND locations.user_id=$3 ORDER BY update::date ASC;", start_date, end_date, test_user_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var adate time.Time
				if err := rows.Scan(&adate); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				dates = append(dates, adate)
				sorted_keys = append(sorted_keys, adate.String())
			}

			var itemsByDate []InvDateItemHistory

			for _, a_date := range dates {
				rows, err = db.Query("SELECT beverages.id, beverages.product, COALESCE(SUM(CASE WHEN locations.type='tap' THEN CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume ELSE 0 END ELSE location_beverages.quantity END),0), COALESCE(SUM(location_beverages.inventory),0) FROM beverages, location_beverages, locations WHERE location_beverages.update::date=$1::date AND location_beverages.beverage_id=beverages.id AND location_beverages.location_id=locations.id AND locations.user_id=$2 GROUP BY beverages.id ORDER BY beverages.product ASC;", a_date, test_user_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}

				var itemInv InvDateItemHistory
				itemInv.Date = a_date

				defer rows.Close()
				for rows.Next() {
					var bevInv BeverageInv
					if err := rows.Scan(
						&bevInv.ID,
						&bevInv.Product,
						&bevInv.Quantity,
						&bevInv.Inventory); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					log.Println(bevInv)
					itemInv.Histories = append(itemInv.Histories, bevInv)
				}
				itemsByDate = append(itemsByDate, itemInv)
			}
			log.Println(itemsByDate)

			js, err := json.Marshal(itemsByDate)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			if len(export) > 0 {
				switch export {
				case "xlsx":
					log.Println("create xlsx")
					createXlsxFile(js, sorted_keys, history_type, "all_", test_user_id, w, r)
				}
			} else {
				w.Header().Set("Content-Type", "application/json")
				w.Write(js)
			}

		} else if history_type == "loc_itemized" {
			// We want to have the first order key be dates, and the second order
			// key be locations.  This way the user can view single location inventory
			// by date if they single out a single location with location filter
			// buttons (XXX future implementation), whereas the other ordering
			// would not have that possibility

			// Dates:
			//   Locations (OMIT TAPS):
			//     Item Inventories (ordered alphabetically)
			//   XXX Add taps back in as location

			var allDateInvs []InvLocSumsByDate

			// Step 1: Gather all unique dates.  This includes tap locations
			var dates []time.Time
			var sorted_keys []string
			rows, err := db.Query("SELECT DISTINCT location_beverages.update::date FROM location_beverages, locations WHERE location_beverages.update>=$1::date AND location_beverages.update<=$2::date AND locations.id=location_beverages.location_id AND locations.user_id=$3 ORDER BY location_beverages.update::date ASC;", start_date, end_date, test_user_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var adate time.Time
				if err := rows.Scan(&adate); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				dates = append(dates, adate)
				sorted_keys = append(sorted_keys, adate.String())
			}

			// Step 2: For each date, gather unique locations.
			// First, we gather while omitting tap locations
			// Then, we gather tap locations
			for _, a_date := range dates {
				var aDateInv InvLocSumsByDate
				aDateInv.Date = a_date
				// -------------------- Non Taps --------------------
				rows, err = db.Query("SELECT DISTINCT location_beverages.location_id FROM location_beverages, locations WHERE location_beverages.update::date=$1 AND locations.id=location_beverages.location_id AND locations.user_id=$2 AND locations.type!='tap' ORDER BY location_beverages.location_id ASC;", a_date, test_user_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				defer rows.Close()
				for rows.Next() {
					var invLocSum InvLocItemHistory
					var loc_id int
					if err := rows.Scan(&loc_id); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					var loc_name NullString
					err := db.QueryRow("SELECT name FROM locations WHERE id=$1;", loc_id).Scan(&loc_name)
					if err != nil {
						// if query failed will exit here, so loc_id is guaranteed below
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					invLocSum.Location = loc_name

					inv_rows, err := db.Query("SELECT location_beverages.beverage_id, beverages.product, location_beverages.quantity, COALESCE(location_beverages.inventory,0) FROM beverages, location_beverages WHERE location_beverages.update::date=$1 AND location_beverages.beverage_id=beverages.id AND location_beverages.location_id=$2 ORDER BY beverages.product ASC;", a_date, loc_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					defer inv_rows.Close()
					for inv_rows.Next() {
						var bevInv BeverageInv
						if err := inv_rows.Scan(
							&bevInv.ID,
							&bevInv.Product,
							&bevInv.Quantity,
							&bevInv.Inventory); err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							continue
						}
						invLocSum.Histories = append(invLocSum.Histories, bevInv)
					}

					aDateInv.LocHistories = append(aDateInv.LocHistories, invLocSum)
				}
				// ---------------------- Taps ----------------------
				var invLocSum InvLocItemHistory
				loc_name := "All Taps"
				invLocSum.Location.String = loc_name
				invLocSum.Location.Valid = true

				inv_rows, err := db.Query("SELECT beverages.id, beverages.product, COALESCE(SUM(CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume ELSE 0 END),0), COALESCE(location_beverages.inventory,0) FROM beverages, location_beverages, locations WHERE location_beverages.update::date=$1 AND location_beverages.beverage_id=beverages.id AND location_beverages.location_id=locations.id AND locations.user_id=$2 AND locations.type='tap' GROUP BY beverages.id, location_beverages.inventory ORDER BY beverages.product ASC;", a_date, test_user_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				defer inv_rows.Close()
				for inv_rows.Next() {
					var bevInv BeverageInv
					if err := inv_rows.Scan(
						&bevInv.ID,
						&bevInv.Product,
						&bevInv.Quantity,
						&bevInv.Inventory); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					invLocSum.Histories = append(invLocSum.Histories, bevInv)
				}
				if len(invLocSum.Histories) > 0 {
					aDateInv.LocHistories = append(aDateInv.LocHistories, invLocSum)
				}

				allDateInvs = append(allDateInvs, aDateInv)
			}

			log.Println(allDateInvs)
			js, err := json.Marshal(allDateInvs)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			if len(export) > 0 {
				switch export {
				case "xlsx":
					log.Println("create xlsx")
					createXlsxFile(js, sorted_keys, history_type, "loc_", test_user_id, w, r)
				}
			} else {
				w.Header().Set("Content-Type", "application/json")
				w.Write(js)
			}

		} else if history_type == "type_itemized" {
			// Same ordering as loc_itemized, first order by dates, second order
			// by type.
			// We piggy back off the InvLocSum* structs which, though they have
			// second order name "Location", we're just using as "Type" here

			var allDateInvs []InvLocSumsByDate

			// Step 1: Gather all unique dates
			var dates []time.Time
			var sorted_keys []string
			rows, err := db.Query("SELECT DISTINCT location_beverages.update::date FROM location_beverages, locations WHERE location_beverages.update>=$1::date AND location_beverages.update<=$2::date AND locations.id=location_beverages.location_id AND locations.user_id=$3 ORDER BY location_beverages.update::date ASC;", start_date, end_date, test_user_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var adate time.Time
				if err := rows.Scan(&adate); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				dates = append(dates, adate)
				sorted_keys = append(sorted_keys, adate.String())
			}

			// Step 2: For each date, gather unique types
			for _, a_date := range dates {
				var aDateInv InvLocSumsByDate
				aDateInv.Date = a_date

				rows, err = db.Query("SELECT DISTINCT beverages.alcohol_type FROM beverages, location_beverages, locations WHERE location_beverages.update::date=$1 AND locations.id=location_beverages.location_id AND locations.user_id=$2 AND beverages.id=location_beverages.beverage_id ORDER BY beverages.alcohol_type ASC;", a_date, test_user_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				defer rows.Close()
				for rows.Next() {
					var invTypeSum InvLocItemHistory
					var type_name string
					if err := rows.Scan(&type_name); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					invTypeSum.Location.String = type_name
					invTypeSum.Location.Valid = true

					inv_rows, err := db.Query("SELECT beverages.id, beverages.product, COALESCE(SUM(CASE WHEN locations.type='tap' THEN CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume ELSE 0 END ELSE location_beverages.quantity END),0), COALESCE(location_beverages.inventory,0) FROM beverages, location_beverages, locations WHERE location_beverages.update::date=$1 AND location_beverages.beverage_id=beverages.id AND location_beverages.location_id=locations.id AND beverages.alcohol_type=$2 GROUP BY beverages.id, location_beverages.inventory ORDER BY beverages.product ASC;", a_date, type_name)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					defer inv_rows.Close()
					for inv_rows.Next() {
						var bevInv BeverageInv
						if err := inv_rows.Scan(
							&bevInv.ID,
							&bevInv.Product,
							&bevInv.Quantity,
							&bevInv.Inventory); err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							continue
						}
						invTypeSum.Histories = append(invTypeSum.Histories, bevInv)
					}

					aDateInv.LocHistories = append(aDateInv.LocHistories, invTypeSum)
				}
				allDateInvs = append(allDateInvs, aDateInv)
			}

			log.Println(allDateInvs)
			js, err := json.Marshal(allDateInvs)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			if len(export) > 0 {
				switch export {
				case "xlsx":
					log.Println("create xlsx")
					createXlsxFile(js, sorted_keys, history_type, "type_", test_user_id, w, r)
				}
			} else {
				w.Header().Set("Content-Type", "application/json")
				w.Write(js)
			}
		}

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
}

// Adds an inventory item type to a location.
func invLocAPIHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {

	case "GET":
		log.Println(r.URL.Query())
		loc_name := r.URL.Query().Get("name")
		loc_type := r.URL.Query().Get("type")

		var locBevs []LocBeverageApp
		log.Println(loc_name)

		if loc_name == "" || loc_type == "" {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		// Verify Location exists or quit
		var loc_id int
		err := db.QueryRow("SELECT id FROM locations WHERE user_id=$1 AND name=$2 AND type=$3;", test_user_id, loc_name, loc_type).Scan(&loc_id)
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

		rows, err := db.Query("SELECT beverages.id, beverages.version_id, beverages.product, beverages.container_type, beverages.brewery, beverages.distributor, beverages.alcohol_type, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, beverages.deposit, location_beverages.quantity, location_beverages.inventory, location_beverages.update FROM beverages, location_beverages WHERE beverages.id=location_beverages.beverage_id AND location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active ORDER BY beverages.product ASC;", loc_id, last_update)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var locBev LocBeverageApp
			if err := rows.Scan(&locBev.ID, &locBev.VersionID, &locBev.Product, &locBev.ContainerType, &locBev.Brewery, &locBev.Distributor, &locBev.AlcoholType, &locBev.PurchaseVolume, &locBev.PurchaseUnit, &locBev.PurchaseCost, &locBev.PurchaseCount, &locBev.Deposit, &locBev.Quantity, &locBev.Inventory, &locBev.Update); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			// We need to do one more thing.  The beverage might have been updated
			// since last time inventory was done in this location (such as having
			// its purchase price changed).  In that case, we want to return the old
			// beverage_id (for saving purposes), and the old quantity, but everything
			// else we want to
			// retrieve from the NEW (current) beverage, so the user sees the latest
			// info about it.
			var most_recent_id int
			do_update := true
			err = db.QueryRow("SELECT id FROM beverages WHERE version_id=(SELECT version_id FROM beverages WHERE id=$1) AND current;", locBev.ID).Scan(&most_recent_id)
			switch {
			// If there were no rows, that means the beverage was probably deleted (no current).  In that case don't do the update
			case err == sql.ErrNoRows:
				do_update = false
			case err != nil:
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			if do_update && most_recent_id != locBev.ID {
				// Note that we're NOT replacing beverages.id, since we want to return
				// the old id so it can be updated when we next PUT and save
				err = db.QueryRow("SELECT product, container_type, brewery, distributor, alcohol_type, purchase_volume, purchase_unit, purchase_cost, purchase_count, deposit FROM beverages WHERE id=$1;", most_recent_id).Scan(&locBev.Product, &locBev.ContainerType, &locBev.Brewery, &locBev.Distributor, &locBev.AlcoholType, &locBev.PurchaseVolume, &locBev.PurchaseUnit, &locBev.PurchaseCost, &locBev.PurchaseCount, &locBev.Deposit)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					log.Println(err.Error())
					continue
				}
				// tell the client that their inventory value reflects an older
				// state of the beverage
				locBev.OutOfDate.Bool = true
				locBev.OutOfDate.Valid = true
			}
			// if do_update is false, that means there's no current id for this
			// beverage (which means it's been deleted).  In that case don't return
			// the beverage
			if do_update {
				locBevs = append(locBevs, locBev)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(locBevs)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":
		// A Post to location_beverages for inventory locations "adds" the beverage
		// to the location with 0 quantity.  It's not an inventory update, but
		// rather adding a beverage type to the inventory location.
		//
		// Expects beverage id, location name, location type
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

		// Verify Location exists or quit
		var loc_id int
		err = db.QueryRow("SELECT id FROM locations WHERE user_id=$1 AND name=$2 AND type=$3;", test_user_id, locBev.Location, locBev.Type).Scan(&loc_id)
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

		//   Does LocationBeverage from last_update exist already?
		//     If it does exist:
		//       If it's not active (deleted), restore active status
		//       If it is active, return, it already is in the location
		//   Else:
		//     Add as normal
		err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM location_beverages WHERE location_id=$1 AND beverage_id=$2 AND update=$3);", loc_id, locBev.ID, last_update).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if exists {
			var active bool
			err = db.QueryRow("SELECT active FROM location_beverages WHERE location_id=$1 AND beverage_id=$2 AND update=$3;", loc_id, locBev.ID, last_update).Scan(&active)
			if active {
				http.Error(w, "Posted beverage exists in location.", http.StatusInternalServerError)
				return
			} else {
				_, err = db.Exec("UPDATE location_beverages SET active=TRUE WHERE location_id=$1 AND beverage_id=$2 AND update=$3;;", loc_id, locBev.ID, last_update)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				// Return the previous quantity and inventory of the now restored bev
				//var test []BeverageInv
				var bevInv BeverageInv
				err = db.QueryRow("SELECT quantity, inventory FROM location_beverages WHERE location_id=$1 AND beverage_id=$2 AND update=$3 AND active;", loc_id, locBev.ID, last_update).Scan(
					&bevInv.Quantity,
					&bevInv.Inventory)
				bevInv.ID = locBev.ID
				//test = append(test, bevInv)

				w.Header().Set("Content-Type", "application/json")
				// need to marshal pointer to struct or custom marshal interface of
				// NullFloat64 is never called
				js, err := json.Marshal(&bevInv)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				w.Write(js)
			}
		} else {
			// doesn't exist yet, means good to add.
			// Set the new location_beverage entry's update time to last_update so it
			// appears with the other entries in this location.
			_, err = db.Exec("INSERT INTO location_beverages (beverage_id, location_id, quantity, update, inventory, active) VALUES ($1, $2, 0, $3, 0, TRUE);", locBev.ID, loc_id, last_update)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

	case "PUT":
		// A PUT to inventory locations is what actually updates quantities of all
		// the beverage types in the location.
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
		err = db.QueryRow("SELECT id FROM locations WHERE user_id=$1 AND name=$2 AND type=$3;", test_user_id, batch.Location, batch.Type).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

		// XXX NEW LOGIC
		// If same_day, update all location_beverages with update=last_update AND active
		// to have update = cur_time.  Otherwise, duplicate (insert) all
		// location_beverages with update=last_update AND active, and set their
		// update to cur_time.
		// Then, update locations.last_update to cur_time.
		// Finally, update all location_beverages with update=last_update with the
		// posted values.
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
		same_day := false
		if cur_year == last_year && cur_month == last_month && cur_day == last_day {
			same_day = true
		}

		// if same day, bring all the old entries from today up to date.  Saving
		// within the same day is recent enough that we don't need separate history
		// entries.
		if same_day {
			_, err = db.Exec("UPDATE location_beverages SET update=$1 WHERE update=$2 AND location_id=$3 AND active;", cur_time, last_update, loc_id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				return
			}
		} else {
			// if not same day, need to insert new entries from the old entries
			// and then subsequently update their quantities
			_, err = db.Exec("INSERT INTO location_beverages (beverage_id, location_id, quantity, inventory, active, update) SELECT beverage_id, location_id, quantity, inventory, active, $1 FROM location_beverages WHERE update=$2 AND location_id=$3 AND active;", cur_time, last_update, loc_id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				return
			}
		}

		// update location last_update
		_, err = db.Exec("UPDATE locations SET last_update=$1 WHERE id=$2;", cur_time, loc_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

		var total_inventory float32
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

			// A note here:
			// We are updating beverages from the LAST save.  The beverage info might
			// have changed (such as user updating pricing, etc), which will mean
			// a new id will exist in the beverages table with the same version_id as
			// the old beverage.  So we have to check if the beverage is current.
			// If it's not, need to replace the location_beverages beverage_id with
			// the most current id.
			var most_recent_id int
			do_update := true
			err = db.QueryRow("SELECT id FROM beverages WHERE version_id=(SELECT version_id FROM beverages WHERE id=$1) AND current;", anItem.ID).Scan(&most_recent_id)
			switch {
			// If there were no rows, that means the beverage was probably deleted (no current).  In that case don't do the update
			case err == sql.ErrNoRows:
				do_update = false
			case err != nil:
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			if do_update && most_recent_id != anItem.ID {
				_, err := db.Exec("UPDATE location_beverages SET beverage_id=$1 WHERE beverage_id=$2 AND location_id=$3 AND update=$4 AND active;", most_recent_id, anItem.ID, loc_id, cur_time)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					log.Println(err.Error())
					continue
				}
			}

			// now, calculate its inventory value and save it in location_beverages
			// for easy retrieval.  This varies by location type:
			// + bev:
			//     inventory = quantity * purchase_cost / purchase_count + deposit
			// + tap:
			//     if purchase_volume not null and not 0:
			//       inventory = quantity / purchase_volume * purchase_cost / purchase_count + deposit
			//     else
			//       inventory = deposit
			// + keg:
			//     inventory = quantity * deposit
			inventory := float32(0)
			unit_cost := float32(0)
			deposit := float32(0)
			err = db.QueryRow("SELECT COALESCE(deposit, 0) FROM beverages WHERE id=$1;", most_recent_id).Scan(&deposit)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}

			if batch.Type == "bev" {
				err = db.QueryRow("SELECT COALESCE(purchase_cost, 0) / COALESCE(purchase_count, 1) FROM beverages WHERE id=$1;", most_recent_id).Scan(&unit_cost)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					log.Println(err.Error())
					continue
				}
				inventory = float32(anItem.Quantity) * (unit_cost + deposit) // parenthesis are important here
			} else if batch.Type == "tap" {
				err = db.QueryRow("SELECT CASE WHEN COALESCE(purchase_volume,0)>0 THEN purchase_cost/COALESCE(purchase_count,1)/purchase_volume ELSE 0 END FROM beverages WHERE id=$1;", most_recent_id).Scan(&unit_cost)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					log.Println(err.Error())
					continue
				}
				inventory = float32(anItem.Quantity)*unit_cost + deposit // no parenthesis here!
			} else if batch.Type == "kegs" {
				inventory = float32(anItem.Quantity) * deposit
			} else {
				http.Error(w, "Encountered incorrect location type!", http.StatusInternalServerError)
				return
			}

			// finally, update its quantity and inventory in location_beverages
			_, err = db.Exec("UPDATE location_beverages SET quantity=$1, inventory=$2 WHERE beverage_id=$3 AND location_id=$4 AND update=$5 AND active;", anItem.Quantity, inventory, most_recent_id, loc_id, cur_time)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}

			total_inventory += inventory
		}

		var retLoc Location
		retLoc.LastUpdate = cur_time
		retLoc.Name = batch.Location
		retLoc.TotalInv = total_inventory
		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(retLoc)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "DELETE":
		loc_name := r.URL.Query().Get("location")
		item_id := r.URL.Query().Get("id")
		loc_type := r.URL.Query().Get("type")

		// Verify Location exists or quit
		var loc_id int
		err := db.QueryRow("SELECT id FROM locations WHERE user_id=$1 AND name=$2 AND type=$3;", test_user_id, loc_name, loc_type).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Verify beverage exists or quit
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

		// set location_beverages.active of deleted entry to false
		_, err = db.Exec("UPDATE location_beverages SET active=FALSE WHERE location_id=$1 AND beverage_id=$2 AND update=$3;", loc_id, item_id, last_update)
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
