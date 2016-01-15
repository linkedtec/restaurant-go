package main

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	_ "github.com/lib/pq"
	"io/ioutil"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"time"
)

var db *sql.DB
var test_user_id string = "1"
var test_restaurant_id string = "1"

type VolumeUnit struct {
	FullName string  `json:"full_name"`
	AbbrName string  `json:"abbr_name"`
	System   string  `json:"system"`
	InLiters float32 `json:"in_liters"`
}

type BeverageLight struct {
	ID            int    `json:"id"`
	VersionID     int    `json:"version_id"`
	ContainerType string `json:"container_type"`
	Product       string `json:"product"`
}

type BeverageSalePlan struct {
	ID             int         `json:"id"`
	VersionID      int         `json:"version_id"`
	Product        string      `json:"product"`
	ContainerType  string      `json:"container_type"`
	ServeType      int         `json:"serve_type"`
	Brewery        NullString  `json:"brewery"`
	AlcoholType    string      `json:"alcohol_type"`
	PurchaseVolume NullFloat64 `json:"purchase_volume"`
	PurchaseUnit   NullString  `json:"purchase_unit"`
	PurchaseCost   float32     `json:"purchase_cost"`
	PurchaseCount  int         `json:"purchase_count"`
	SaleStatus     NullString  `json:"sale_status"`
	SaleStart      NullTime    `json:"sale_start"`
	SaleEnd        NullTime    `json:"sale_end"`
	Par            NullFloat64 `json:"par"`
	SalePrices     []SalePrice `json:"size_prices"`
	CountRecent    NullFloat64 `json:"count_recent"`
	LastInvUpdate  NullTime    `json:"last_inv_update"`
}

type BeverageInv struct {
	ID          int         `json:"id"`
	Product     string      `json:"product"`
	Brewery     NullString  `json:"brewery"`
	Distributor NullString  `json:"distributor"`
	Volume      NullFloat64 `json:"volume"`
	Unit        NullString  `json:"unit"`
	Quantity    float32     `json:"quantity"`
	Wholesale   NullFloat64 `json:"wholesale"`
	Deposit     NullFloat64 `json:"deposit"` // This is the TOTAL deposit based on quantity
	Inventory   NullFloat64 `json:"inventory"`
	Type        NullString  `json:"type"`
}

type Beverage struct {
	ID             int         `json:"id"`
	VersionID      int         `json:"version_id"`
	ContainerType  string      `json:"container_type"`
	ServeType      int         `json:"serve_type"`
	Product        string      `json:"product"`
	Distributor    NullString  `json:"distributor"`
	DistributorID  NullInt64   `json:"distributor_id"`
	KegID          NullInt64   `json:"keg_id"`
	Deposit        NullFloat64 `json:"deposit"`
	Brewery        NullString  `json:"brewery"`
	AlcoholType    string      `json:"alcohol_type"`
	ABV            NullFloat64 `json:"abv"`
	PurchaseVolume NullFloat64 `json:"purchase_volume"`
	PurchaseUnit   NullString  `json:"purchase_unit"`
	PurchaseCost   float32     `json:"purchase_cost"`
	PurchaseCount  int         `json:"purchase_count"`
	FlavorProfile  NullString  `json:"flavor_profile"`
	SalePrices     []SalePrice `json:"size_prices"`
	Count          float32     `json:"count"`
	CountRecent    NullFloat64 `json:"count_recent"`
	LastInvUpdate  NullTime    `json:"last_inv_update"`
	Inventory      NullFloat64 `json:"inventory"`
	SaleStatus     NullString  `json:"sale_status"`
	SaleStart      NullTime    `json:"sale_start"`
	SaleEnd        NullTime    `json:"sale_end"`
	Par            NullFloat64 `json:"par"`
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

// This is the LocBeverage struct that is communicated to and from the app
type LocBeverageApp struct {
	ID             int         `json:"id"`
	VersionID      int         `json:"version_id"`
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
	Inventory      NullFloat64 `json:"inventory"`
	Update         time.Time   `json:"update"`
	Location       NullString  `json:"location"`
	LocationID     int         `json:"location_id"`
	Type           string      `json:"type"`
	OutOfDate      NullBool    `json:"out_of_date"`
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
	TotalInv   float32    `json:"total_inventory"`
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

	http.HandleFunc("/timezone", timezoneHandler)

	// handle users
	setupUsersHandlers()

	// handle inventory pages
	setupInvHandlers()
	setupMenuHandlers()
	setupTapsHandlers()
	setupDistributorHandlers()
	setupDeliveriesHandlers()
	setupPurchaseOrderHandlers()

	// cron job for refreshing online menu pages
	setupMenuPagesCron()

	// cron job every day for resetting sms_limits, allows each restaurant to
	// send up to 20 SMS a day
	setupSMSLimitsCron()

	// cron job every hour for sending pending purchase orders when their
	// order_date is up
	setupSendPendingPOsCron()

	log.Printf("Listening on port 8080...")
	log.Print("Current time is: " + getCurrentTime())
	http.ListenAndServe(":8080", nil)
}

func getCurrentTime() string {
	const timeLayout = "Jan 2, 2006 3:04pm (MST)"
	cur_time := time.Now().UTC().Format(timeLayout)
	return cur_time
}

func getRestaurantTimeZone(restaurant_id string) (string, error) {
	var tz_str string
	err := db.QueryRow("SELECT timezone FROM restaurants WHERE id=$1;", restaurant_id).Scan(&tz_str)
	if err != nil {
		return "", err
	}
	return tz_str, nil
}

// Notes on timezones:
// Client times Scanned into Struct times are timestamp without time zone
// Direct queries into DB such as ‘update from location_beverages’ are timestamp without time zone
//   Hence they require AT TIME ZONE ‘UTC’ AT TIME ZONE ‘OFFSET’ treatment
// Times from time.Parse are timestamp with time zone
//   Hence they do not require first UTC, just AT TIME ZONE ‘OFFSET’
func getTimeAtTimezone(in_time time.Time, in_tz string, has_timezone bool) time.Time {
	log.Println(in_time)
	log.Println(in_tz)
	var ret_time time.Time
	var err error
	if has_timezone == true {
		err = db.QueryRow("SELECT $1 AT TIME ZONE $2;", in_time, in_tz).Scan(&ret_time)
	} else {
		err = db.QueryRow("SELECT $1 AT TIME ZONE 'UTC' AT TIME ZONE $2;", in_time, in_tz).Scan(&ret_time)
	}
	if err != nil {
		log.Println(err.Error())
		return time.Now().UTC()
	}
	return ret_time
}

func getTimeAtTimezoneFromString(in_time string, in_tz string, has_timezone bool) time.Time {
	log.Println(in_time)
	log.Println(in_tz)
	var ret_time time.Time
	var err error
	if has_timezone == true {
		err = db.QueryRow("SELECT $1 AT TIME ZONE $2;", in_time, in_tz).Scan(&ret_time)
	} else {
		err = db.QueryRow("SELECT $1 AT TIME ZONE 'UTC' AT TIME ZONE $2;", in_time, in_tz).Scan(&ret_time)
	}
	if err != nil {
		log.Println(err.Error())
		return time.Now().UTC()
	}
	return ret_time
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Root handler")
	http.ServeFile(w, r, "./home.html")
	//fmt.Fprintf(w, "Hi there")
}

func timezoneHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		restaurant_id := r.URL.Query().Get("restaurant_id")

		var timezone string
		err := db.QueryRow(`SELECT timezone FROM restaurants WHERE id=$1;`, restaurant_id).Scan(&timezone)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		var tz_hour int
		err = db.QueryRow(`SELECT EXTRACT (TIMEZONE_HOUR FROM CURRENT_TIME AT TIME ZONE $1);`, timezone).Scan(&tz_hour)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		type TimezoneReturn struct {
			Timezone string `json:"timezone"`
			Offset   int    `json:"offset"`
		}

		var tzr TimezoneReturn
		tzr.Timezone = timezone
		// Note that even though the extract query gives us e.g., -5 for EST,
		// since the client JS getTimezoneOffset function and the POSIX queries
		// in Postgres all flip this, let's flip this here too
		tzr.Offset = tz_hour * -1

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&tzr)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)
	}
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

// helper function which adds a new version for a beverage, setting its old
// version to inactive (current=FALSE).  Duplicates a beverage entry in the
// beverages table, setting the old entry inactive and the new one active
// with the same version_id
func updateBeverageVersion(old_id int) (int, error) {

	// XXX find the latest id with the same version_id as old_id.  We might
	// be retiring an old beverage id which isn't latest, for example, when
	// confirming deliveries.
	var latest_id int
	err := db.QueryRow(`
		SELECT id FROM beverages WHERE current=TRUE AND 
		version_id=(SELECT version_id FROM beverages WHERE id=$1);`, old_id).Scan(&latest_id)
	if err != nil {
		return -1, err
	}

	// duplicate the entry, which will create a new serial id
	var new_id int
	err = db.QueryRow(`
		INSERT INTO beverages (
			distributor_id, keg_id, product, brewery, alcohol_type, abv, 
			purchase_volume, purchase_cost, purchase_unit, flavor_profile, 
			restaurant_id, container_type, serve_type, purchase_count, version_id, 
			sale_status, sale_start, sale_end, par) 
		SELECT distributor_id, keg_id, product, brewery, alcohol_type, abv, 
			purchase_volume, purchase_cost, purchase_unit, flavor_profile, 
			restaurant_id, container_type, serve_type, purchase_count, version_id, 
			sale_status, sale_start, sale_end, par 
		FROM beverages WHERE id=$1 RETURNING id;`, latest_id).Scan(&new_id)
	if err != nil {
		return -1, err
	}

	// outmode the old id
	cur_time := time.Now().UTC()
	_, err = db.Exec("UPDATE beverages SET end_date=$1, current=FALSE where id=$2", cur_time, latest_id)
	if err != nil {
		return -1, err
	}

	// set the new id as current
	_, err = db.Exec("UPDATE beverages SET start_date=$1, current=TRUE where id=$2", cur_time, new_id)
	if err != nil {
		return -1, err
	}

	return new_id, nil
}

// given a version_id of a beverage, returns the "recent" inventory done
// within a time limit.  That's currently 3 days, but this might be subject
// to change.
// Returns the recent inventory, the time of the last inventory, and error
func getBeverageRecentInventory(version_id int) (NullFloat64, NullTime, error) {

	seconds_three_days := 60 * 60 * 24 * 3

	var count_recent NullFloat64
	count_recent.Valid = false
	count_recent.Float64 = 0
	var last_inv_update NullTime

	// Now get the count of this beverage in inventory which was done
	// within the past 3 days.  We get the EPOCH between the inventory
	// time and the current time to get the time difference in seconds.

	err := db.QueryRow("SELECT SUM(location_beverages.quantity) FROM location_beverages, locations WHERE locations.type='bev' AND locations.active AND location_beverages.location_id=locations.id AND location_beverages.update=locations.last_update AND EXTRACT(EPOCH FROM (now() AT TIME ZONE 'UTC' - location_beverages.update)) < $1 AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=$2 AND location_beverages.type='bev' AND location_beverages.active;", seconds_three_days, version_id).Scan(&count_recent)
	switch {
	case err == sql.ErrNoRows:
		count_recent.Float64 = 0
		count_recent.Valid = false
		err = nil
	case err != nil:
		log.Println(err.Error())
		return count_recent, last_inv_update, err
	}

	err = db.QueryRow("SELECT location_beverages.update FROM location_beverages, locations WHERE locations.type='bev' AND locations.active AND location_beverages.location_id=locations.id AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=$1 AND location_beverages.type='bev' AND location_beverages.active ORDER BY location_beverages.update DESC LIMIT 1;", version_id).Scan(&last_inv_update)
	if err != nil {
		log.Println(err.Error())
		return count_recent, last_inv_update, err
	}

	return count_recent, last_inv_update, err
}

func sendAttachmentEmail(email_address string, email_title string, email_body string, file_location string, file_name string, attachment_type string) error {
	from := "bevappdaemon@gmail.com"
	to := email_address
	to_name := "Recipient"
	marker := "ACUSTOMANDUNIQUEBOUNDARY"
	subject := email_title
	body := email_body

	// part1 will be the mail headers
	part1 := fmt.Sprintf("From: Bev App <%s>\r\nTo: %s <%s>\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=%s\r\n--%s", from, to_name, to, subject, marker, marker)

	// part2 will be the body of the email (text or HTML)
	part2 := fmt.Sprintf("\r\nContent-Type: text/html\r\nContent-Transfer-Encoding:8bit\r\n\r\n%s\r\n--%s", body, marker)

	// read and encode attachment
	content, _ := ioutil.ReadFile(file_location)
	encoded := base64.StdEncoding.EncodeToString(content)

	//split the encoded file in lines (doesn't matter, but low enough not to hit a max limit)
	lineMaxLength := 500
	nbrLines := len(encoded) / lineMaxLength

	var buf bytes.Buffer

	//append lines to buffer
	for i := 0; i < nbrLines; i++ {
		buf.WriteString(encoded[i*lineMaxLength:(i+1)*lineMaxLength] + "\n")
	} //for

	//append last line in buffer
	buf.WriteString(encoded[nbrLines*lineMaxLength:])

	//part 3 will be the attachment
	part3 := fmt.Sprintf("\r\nContent-Type: %s; name=\"%s\"\r\nContent-Transfer-Encoding:base64\r\nContent-Disposition: attachment; filename=\"%s\"\r\n\r\n%s\r\n--%s--", attachment_type, file_location, file_name, buf.String(), marker)

	//send the email
	auth := smtp.PlainAuth(
		"",
		"bevappdaemon@gmail.com",
		"bevApp4eva",
		"smtp.gmail.com",
	)
	err := smtp.SendMail(
		"smtp.gmail.com:587",
		auth,
		from,
		[]string{to},
		[]byte(part1+part2+part3),
	)

	return err
}
