package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	_ "github.com/lib/pq"
	"log"
	"net/http"
	"os"
	"time"
)

var db *sql.DB
var test_user_id string = "1"

type Beverage struct {
	ID             int         `json:"id"`
	Distributor    string      `json:"distributor"`
	Product        string      `json:"product"`
	Brewery        string      `json:"brewery"`
	AlcoholType    string      `json:"alcohol_type"`
	ABV            float32     `json:"abv"`
	PurchaseVolume float32     `json:"purchase_volume"`
	PurchaseUnit   string      `json:"purchase_unit"`
	PurchaseCost   float32     `json:"purchase_cost"`
	Deposit        float32     `json:"deposit"`
	FlavorProfile  string      `json:"flavor_profile"`
	SalePrices     []SalePrice `json:"size_prices"`
	Count          int         `json:"count"`
}

type BeverageUpdate struct {
	Bev        Beverage `json:"beverage"`
	ChangeKeys []string `json:"change_keys"`
}

type SalePrice struct {
	ID     int     `json:"id"`
	Volume float32 `json:"volume"`
	Unit   string  `json:"unit"`
	Price  float32 `json:"price"`
}

type LocBeverage struct {
	ID             int       `json:"id"`
	Product        string    `json:"product"`
	AlcoholType    string    `json:"alcohol_type"`
	PurchaseVolume string    `json:"purchase_volume"`
	PurchaseUnit   string    `json:"purchase_unit"`
	Quantity       float32   `json:"quantity"`
	LastUpdate     time.Time `json:"last_update"`
	Location       string    `json:"location"`
}

type LocBeverageBatch struct {
	Items    []LocBeverage `json:"items"`
	Location string        `json:"location"`
}

// When client getting existing existing inventory items from server
type LocInvItem struct {
	Name       string    `json:"name"`
	Unit       string    `json:"unit"`
	Quantity   string    `json:"quantity"`
	LastUpdate time.Time `json:"last_update"`
	Price      string    `json:"unit_price"`
	Location   string    `json:"location"`
}

// When client posting new location inventory item to server
type NewLocItem struct {
	Name     string  `json:"name"`
	Unit     string  `json:"unit"`
	Location string  `json:"location"`
	Quantity int     `json:"quantity"`
	Price    float32 `json:"unit_price"`
}

type Location struct {
	Name       string    `json:"name"`
	LastUpdate time.Time `json:"last_update"`
}

type RenameTuple struct {
	Name    string `json:"name"`
	NewName string `json:"new_name"`
}

// When user posts a new inventory item
type NewItem struct {
	Name string `json:"name"`
}

func main() {

	var err error
	// Production will have env RESTAURANT_PRODUCTION set by the Dockerfile
	isProduction := os.Getenv("RESTAURANT_PRODUCTION")
	var db_cmd string
	if isProduction == "1" {
		db_cmd = fmt.Sprintf("host=%s sslmode=disable user=restaurant_app dbname=restaurant", os.Getenv("POSTGRES_PORT_5432_TCP_ADDR"))
	} else {
		db_cmd = "host=localhost sslmode=disable user=dhchang dbname=dhchang"
	}

	db, err = sql.Open("postgres", db_cmd)
	if err != nil {
		log.Fatal(err)
	}

	// handle home
	http.HandleFunc("/", rootHandler)

	// handle static content
	staticHandler := http.FileServer(http.Dir("static"))
	http.Handle("/static/", http.StripPrefix("/static/", staticHandler))

	// handle libraries
	libHandler := http.FileServer(http.Dir("lib"))
	http.Handle("/lib/", http.StripPrefix("/lib/", libHandler))

	// handle inventory page
	invHandler := http.FileServer(http.Dir("inventory"))
	http.Handle("/inventory/", http.StripPrefix("/inventory/", invHandler))

	// handle inventory APIs
	http.HandleFunc("/inv", invAPIHandler)
	http.HandleFunc("/inv/loc", invLocAPIHandler)
	http.HandleFunc("/loc", locAPIHandler)

	log.Printf("Listening on port 8080...")
	log.Print("Current time is: " + getCurrentTime())
	http.ListenAndServe(":8080", nil)
}

func getCurrentTime() string {
	const timeLayout = "Jan 2, 2006 3:04pm (MST)"
	curTime := time.Now().UTC().Format(timeLayout)
	return curTime
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Root handler")
	http.ServeFile(w, r, "./home.html")
	//fmt.Fprintf(w, "Hi there")
}

// Adds an inventory item type to a location.
func invLocAPIHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "DELETE":
		loc_name := r.URL.Query().Get("location")
		item_id := r.URL.Query().Get("id")

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

		_, err = db.Exec("DELETE FROM location_beverages WHERE beverage_id=$1 AND location_id=$2;", item_id, loc_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

	case "GET":
		loc_name := r.URL.Query().Get("name")

		var locBevs []LocBeverage
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

		log.Println(loc_id)

		rows, err := db.Query("SELECT beverages.id, beverages.product, beverages.alcohol_type, beverages.purchase_volume, beverages.purchase_unit, location_beverages.quantity, location_beverages.last_update FROM beverages, location_beverages WHERE beverages.id=location_beverages.beverage_id AND location_beverages.location_id=$1 ORDER BY beverages.product ASC;", loc_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var locBev LocBeverage
			if err := rows.Scan(&locBev.ID, &locBev.Product, &locBev.AlcoholType, &locBev.PurchaseVolume, &locBev.PurchaseUnit, &locBev.Quantity, &locBev.LastUpdate); err != nil {
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
		var locBev LocBeverage
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

		log.Println("About the check if exists")

		// Verify Item exists
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

		// Does LocationBeverage exist already?
		err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM location_beverages WHERE location_id=$1 AND beverage_id=$2);", loc_id, locBev.ID).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
		}
		if !exists {
			_, err = db.Exec("INSERT INTO location_beverages (beverage_id, location_id, quantity, last_update) VALUES ($1, $2, $3, $4);", locBev.ID, loc_id, 0, time.Now().UTC())
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
		var batch LocBeverageBatch
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

		// first update location last_update
		_, err = db.Exec("UPDATE locations SET last_update=$1 WHERE id=$2;", time.Now().UTC(), loc_id)
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
			_, err := db.Exec("UPDATE location_beverages SET quantity=$1, last_update=$2 WHERE beverage_id=$3 AND location_id=$4;", anItem.Quantity, time.Now().UTC(), anItem.ID, loc_id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}
		}
		//log.Println(batch.Items)

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return

	}
}

func invAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "GET":
		var beverages []Beverage

		rows, err := db.Query("SELECT id, distributor, product, brewery, alcohol_type, abv, purchase_volume, purchase_unit, purchase_cost, deposit, flavor_profile FROM beverages WHERE user_id=$1", test_user_id)
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
				&bev.Distributor,
				&bev.Product,
				&bev.Brewery,
				&bev.AlcoholType,
				&bev.ABV,
				&bev.PurchaseVolume,
				&bev.PurchaseUnit,
				&bev.PurchaseCost,
				&bev.Deposit,
				&bev.FlavorProfile); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			var exists bool
			err := db.QueryRow("SELECT EXISTS (SELECT 1 FROM location_beverages WHERE beverage_id=$1);", bev.ID).Scan(&exists)
			if !exists {
				bev.Count = 0
			} else {
				// Now get the total count of this beverage
				err = db.QueryRow("SELECT SUM(quantity) FROM location_beverages WHERE beverage_id=$1;", bev.ID).Scan(&bev.Count)
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
		_, err = db.Exec("INSERT INTO beverages(product, distributor, brewery, alcohol_type, abv, purchase_volume, purchase_unit, purchase_cost, deposit, flavor_profile, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);",
			bev.Product, bev.Distributor, bev.Brewery, bev.AlcoholType, bev.ABV, bev.PurchaseVolume, bev.PurchaseUnit, bev.PurchaseCost, bev.Deposit, bev.FlavorProfile, test_user_id)
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

		// For each of the SalePrice items, insert entry into size_prices
		for i := range bev.SalePrices {
			salePrice := bev.SalePrices[i]
			_, err = db.Exec("INSERT INTO size_prices(serving_size, serving_unit, serving_price, beverage_id) VALUES($1, $2, $3, $4);", salePrice.Volume, salePrice.Unit, salePrice.Price, bev_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		js, err := json.Marshal(bev)
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
			query := fmt.Sprintf("DELETE FROM size_prices WHERE beverage_id=%d;", bev_id)
			log.Println(query)
			_, err = db.Exec(query)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			// Now insert fresh entries for the sale prices
			for _, sp := range sps {
				query := fmt.Sprintf("INSERT INTO size_prices(serving_size, serving_unit, serving_price, beverage_id) VALUES (%f, '%s', %f, %d);", sp.Volume, sp.Unit, sp.Price, bev_id)
				log.Println(query)
				_, err = db.Exec(query)
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
				} else if key == "distributor" {
					values = append(values, "'"+bev_update.Bev.Distributor+"'")
				} else if key == "brewery" {
					values = append(values, "'"+bev_update.Bev.Brewery+"'")
				} else if key == "alcohol_type" {
					values = append(values, "'"+bev_update.Bev.AlcoholType+"'")
				} else if key == "abv" {
					values = append(values, fmt.Sprintf("%f", bev_update.Bev.ABV))
				} else if key == "purchase_volume" {
					values = append(values, fmt.Sprintf("%f", bev_update.Bev.PurchaseVolume))
				} else if key == "purchase_unit" {
					values = append(values, "'"+bev_update.Bev.PurchaseUnit+"'")
				} else if key == "purchase_cost" {
					values = append(values, fmt.Sprintf("%f", bev_update.Bev.PurchaseCost))
				} else if key == "deposit" {
					values = append(values, fmt.Sprintf("%f", bev_update.Bev.Deposit))
				} else if key == "flavor_profile" {
					values = append(values, "'"+bev_update.Bev.FlavorProfile+"'")
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
