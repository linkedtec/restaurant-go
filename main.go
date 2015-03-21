package main

import (
	"database/sql"
	"encoding/json"
	_ "github.com/lib/pq"
	"log"
	"net/http"
	"os"
	"time"
	"fmt"
)

var db *sql.DB
var test_user_id string = "1"

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
	Name string `json:"name"`
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

// Adds an inventory item of a unit type to a location.
func invLocAPIHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "DELETE":
		loc_name := r.URL.Query().Get("location")
		item_name := r.URL.Query().Get("name")
		unit_name := r.URL.Query().Get("unit")

		// Verify Location exists or quit
		var loc_id int
		err := db.QueryRow("SELECT id FROM locations WHERE user_id=$1 and name=$2;", test_user_id, loc_name).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var item_id int
		err = db.QueryRow("SELECT id FROM items WHERE user_id=$1 AND name=$2;", test_user_id, item_name).Scan(&item_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			log.Println(err.Error())
			return
		}

		var unit_id int
		err = db.QueryRow("SELECT id FROM units WHERE user_id=$1 AND name=$2", test_user_id, unit_name).Scan(&unit_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			log.Println(err.Error())
			return
		}

		_, err = db.Exec("DELETE FROM location_item_units WHERE item_id=$1 AND unit_id=$2 AND loc_id=$3;", item_id, unit_id, loc_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

	case "GET":
		loc_name := r.URL.Query().Get("name")

		var items []LocInvItem
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

		rows, err := db.Query("SELECT items.name, units.name, location_item_units.quantity, location_item_units.last_update, location_item_units.unit_price FROM items, units, location_item_units WHERE items.id=location_item_units.item_id AND units.id = location_item_units.unit_id AND location_item_units.loc_id=$1 ORDER BY items.name ASC;", loc_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var invItem LocInvItem
			if err := rows.Scan(&invItem.Name, &invItem.Unit, &invItem.Quantity, &invItem.LastUpdate, &invItem.Price); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			items = append(items, invItem)
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(items)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":
		// Expects name, unit, loc, quantity, price
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
		var result NewLocItem
		err := decoder.Decode(&result)
		if err != nil {
		   log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Println(result.Name)
		//log.Println(result.Unit)
		//log.Println(result.Loc)
		//log.Println(result.Quantity)
		//log.Println(result.Price)
		if result.Name == "" || result.Unit == "" || result.Location == "" {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}
		// Verify Location exists or quit
		var loc_id int
		err = db.QueryRow("SELECT id FROM locations WHERE user_id=$1 and name=$2;", test_user_id, result.Location).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		log.Println("About the check if exists")

		// Verify Item exists or add it
		var exists bool
		err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM items WHERE user_id=$1 AND name=$2);", test_user_id, result.Name).Scan(&exists)
		if err != nil {
		   log.Println(err.Error())
		   http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		if !exists {
			// the item doesn't currently exist, so add it
			_, err = db.Exec("INSERT INTO items (name, user_id) VALUES ($1, $2)", result.Name, test_user_id)
			if err != nil {
			   log.Println(err.Error())
			   http.Error(w, err.Error(), http.StatusInternalServerError)
			}
		}
		var existing_item_id int
		err = db.QueryRow("SELECT id FROM items WHERE user_id=$1 and name=$2", test_user_id, result.Name).Scan(&existing_item_id)
		if err != nil {
		       log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		log.Println("Printing existing item id")
		log.Println(existing_item_id)

		// Verify Unit exists or add it
		err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM units WHERE user_id=$1 AND name=$2);", test_user_id, result.Unit).Scan(&exists)
		if err != nil {
		   log.Println(err.Error())
		}
		if !exists {
			// the item doesn't currently exist, so add it
			_, err = db.Exec("INSERT INTO units (name, user_id) VALUES ($1, $2)", result.Unit, test_user_id)
			if err != nil {
			   log.Println(err.Error())
			}
		}
		log.Println("About to test unit id existing")
		var existing_unit_id int
		err = db.QueryRow("SELECT id FROM units WHERE user_id=$1 and name=$2", test_user_id, result.Unit).Scan(&existing_unit_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		log.Println(existing_unit_id)

		// Verify ItemUnit exists or add it
		err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM item_units WHERE item_id=$1 AND unit_id=$2);", existing_item_id, existing_unit_id).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
		}
		log.Println(exists)
		if !exists {
			// the item doesn't currently exist, so add it
			db.Exec("INSERT INTO item_units (item_id, unit_id, date_added) VALUES ($1, $2, $3);", existing_item_id, existing_unit_id, time.Now())
		}

		// Does LocationItemUnit exist already?
		err = db.QueryRow("SELECT EXISTS (SELECT 1 FROM location_item_units WHERE loc_id=$1 AND item_id=$2 AND unit_id=$3);", loc_id, existing_item_id, existing_unit_id).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
		}
		if !exists {
			_, err = db.Exec("INSERT INTO location_item_units (item_id, unit_id, loc_id, quantity, last_update, unit_price) VALUES ($1, $2, $3, $4, $5, $6);", existing_item_id, existing_unit_id, loc_id, result.Quantity, time.Now(), result.Price)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			_, err = db.Exec("UPDATE location_item_units SET quantity=$1, last_update=$2 WHERE item_id=$3 AND unit_id=$4 AND loc_id=$5;", result.Quantity, time.Now(), existing_item_id, existing_unit_id, loc_id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
	case "PUT":
		log.Println("Received /inv/loc PUT")
		decoder := json.NewDecoder(r.Body)
		var result LocInvItem
		err := decoder.Decode(&result)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Println(result.Name)
		log.Println(result.Quantity)
		log.Println(result.Location)
		log.Println(result.Unit)
		log.Println(result.Price)
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

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return

	}
}

func invAPIHandler(w http.ResponseWriter, r *http.Request) {

	/*
		switch r.Method {
		case "GET":
			var items []InventoryItem

			rows, err := db.Query("SELECT * FROM inventory")
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var name []byte
				var qty []byte
				var date []byte
				var id int
				if err := rows.Scan(&name, &qty, &date, &id); err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				invItem := InventoryItem{string(name), string(qty), string(date)}
				items = append(items, invItem)
			}

			w.Header().Set("Content-Type", "application/json")
			js, err := json.Marshal(items)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)
		case "POST":
			decoder := json.NewDecoder(r.Body)
			var result NewItem
			err := decoder.Decode(&result)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			db.Exec("INSERT INTO inventory(name) VALUES ('" + string(result.Name) + "');")
		default:
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}
	*/
}

func locAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "GET":
		var locations []Location

		log.Println(test_user_id)
		rows, err := db.Query("SELECT name FROM locations WHERE user_id=" + string(test_user_id))
		if err != nil {
			log.Fatal(err)
		}
		defer rows.Close()
		for rows.Next() {
			var name []byte
			if err := rows.Scan(&name); err != nil {
				log.Fatal(err)
			}
			loc := Location{string(name)}
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
		decoder := json.NewDecoder(r.Body)
		var result NewItem
		log.Println("Post new location: ")
		err := decoder.Decode(&result)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Println(result.Name)
		_, err = db.Exec("INSERT INTO locations(name, user_id) VALUES ('" + string(result.Name) + "', " + string(test_user_id) + ");")
		if err != nil {
		   log.Println(err.Error())
		}
	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return

	}
}
