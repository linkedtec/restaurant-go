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

type VolumeUnit struct {
	FullName string  `json:"full_name"`
	AbbrName string  `json:"abbr_name"`
	System   string  `json:"system"`
	InLiters float32 `json:"in_liters"`
}

type BeverageLight struct {
	ID            int    `json:"id"`
	ContainerType string `json:"container_type"`
	Product       string `json:"product"`
}

type Beverage struct {
	ID             int         `json:"id"`
	ContainerType  string      `json:"container_type"`
	ServeType      int         `json:"serve_type"`
	Product        string      `json:"product"`
	Distributor    NullString  `json:"distributor"`
	Brewery        NullString  `json:"brewery"`
	AlcoholType    string      `json:"alcohol_type"`
	ABV            NullFloat64 `json:"abv"`
	PurchaseVolume NullFloat64 `json:"purchase_volume"`
	PurchaseUnit   NullString  `json:"purchase_unit"`
	PurchaseCost   float32     `json:"purchase_cost"`
	PurchaseCount  int         `json:"purchase_count"`
	EmptyKegs      NullInt64   `json:"empty_kegs"`
	Deposit        NullFloat64 `json:"deposit"`
	FlavorProfile  NullString  `json:"flavor_profile"`
	SalePrices     []SalePrice `json:"size_prices"`
	Count          int         `json:"count"`
}

type BeverageUpdate struct {
	Bev        Beverage `json:"beverage"`
	ChangeKeys []string `json:"change_keys"`
}

type SalePrice struct {
	ID     int         `json:"id"`
	Volume NullFloat64 `json:"volume"`
	Unit   string      `json:"unit"`
	Price  NullFloat64 `json:"price"`
}

// This is the LocBeverage struct that is used internally on the server
// and corresponds to the DB design
type LocBeverage struct {
	BevID    int       `json:"beverage_id"`
	LocID    int       `json:"location_id"`
	Quantity float32   `json:"quantity"`
	Update   time.Time `json:"update"`
}

// This is the LocBeverage struct that is communicated to and from the app
type LocBeverageApp struct {
	ID             int         `json:"id"`
	Product        string      `json:"product"`
	ContainerType  string      `json:"container_type"`
	Brewery        NullString  `json:"brewery"`
	Distributor    NullString  `json:"distributor"`
	AlcoholType    string      `json:"alcohol_type"`
	PurchaseVolume NullFloat64 `json:"purchase_volume"`
	PurchaseUnit   NullString  `json:"purchase_unit"`
	PurchaseCost   float32     `json:"purchase_cost"`
	PurchaseCount  int         `json:"purchase_count"`
	Deposit        NullFloat64 `json:"deposit"`
	Quantity       float32     `json:"quantity"`
	Update         time.Time   `json:"update"`
	Location       NullString  `json:"location"`
	LocationID     int         `json:"location_id"`
	Type           string      `json:"type"`
}

type LocBeverageAppBatch struct {
	Items    []LocBeverageApp `json:"items"`
	Location NullString       `json:"location"`
	Type     string           `json:"type"`
}

type Location struct {
	ID         int        `json:"id"`
	Name       NullString `json:"name"`
	LastUpdate time.Time  `json:"last_update"`
	Type       string     `json:"type"`
}

type RenameTuple struct {
	Name    string `json:"name"`
	NewName string `json:"new_name"`
	Type    string `json:"type"`
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

	// handle volume_units APIs
	http.HandleFunc("/volume_units", volumeUnitsHandler)

	// handle inventory pages
	setupInvHandlers()
	setupTapsHandlers()

	log.Printf("Listening on port 8080...")
	log.Print("Current time is: " + getCurrentTime())
	http.ListenAndServe(":8080", nil)
}

func getCurrentTime() string {
	const timeLayout = "Jan 2, 2006 3:04pm (MST)"
	cur_time := time.Now().UTC().Format(timeLayout)
	return cur_time
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Root handler")
	http.ServeFile(w, r, "./home.html")
	//fmt.Fprintf(w, "Hi there")
}

func volumeUnitsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		var vol_units []VolumeUnit

		rows, err := db.Query("SELECT full_name, abbr_name, system, in_liters FROM volume_units;")
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var vu VolumeUnit
			if err := rows.Scan(
				&vu.FullName,
				&vu.AbbrName,
				&vu.System,
				&vu.InLiters); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			vol_units = append(vol_units, vu)
		}
		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(vol_units)
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
