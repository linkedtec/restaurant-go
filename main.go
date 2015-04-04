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
	SalePrices     []SalePrice `json:"sale_prices"`
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
	curTime := time.Now().Format(timeLayout)
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
			_, err = db.Exec("INSERT INTO location_beverages (beverage_id, location_id, quantity, last_update) VALUES ($1, $2, $3, $4);", locBev.ID, loc_id, 0, time.Now())
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
		_, err = db.Exec("UPDATE locations SET last_update=$1 WHERE id=$2;", time.Now(), loc_id)
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
			_, err := db.Exec("UPDATE location_beverages SET quantity=$1, last_update=$2 WHERE beverage_id=$3 AND location_id=$4;", anItem.Quantity, time.Now(), anItem.ID, loc_id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}
		}
		//log.Println(batch.Items)

		/*
			// using name, unit, and location, and user, can determine the entry
			// in location_item_units and update the quantity, unit_price, and
			// last_update
			// Verify Location exists or quit
			var loc_id int
			err = db.QueryRow("SELECT id FROM locations WHERE user_id=$1 AND name=$2;", test_user_id, result.Location).Scan(&loc_id)
			if err != nil {
				// if query failed will exit here, so loc_id is guaranteed below
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				return
			}

			var item_id int
			err = db.QueryRow("SELECT id FROM items WHERE user_id=$1 AND name=$2;", test_user_id, result.Name).Scan(&item_id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				log.Println(err.Error())
				return
			}

			var unit_id int
			err = db.QueryRow("SELECT id FROM units WHERE user_id=$1 AND name=$2", test_user_id, result.Unit).Scan(&unit_id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				log.Println(err.Error())
				return
			}

			_, err = db.Exec("UPDATE location_item_units SET quantity=$1, unit_price=$2, last_update=$3 WHERE item_id=$4 AND unit_id=$5 AND loc_id=$6;", result.Quantity, result.Price, time.Now(), item_id, unit_id, loc_id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				return
			}
		*/

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
		err = db.QueryRow("SELECT currval('beverages_id_seq');").Scan(&bev_id)
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
	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return

	}
}
