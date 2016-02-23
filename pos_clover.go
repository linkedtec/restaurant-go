package main

import (
	"database/sql"
	"encoding/json"
	_ "github.com/go-sql-driver/mysql"
	"log"
	"net/http"
	"time"
)

type CloverSale struct {
	// clover-side vars
	Total  NullFloat64 `json:"total"`
	Count  NullInt64   `json:"count"`
	Name   NullString  `json:"name"`
	Price  NullFloat64 `json:"price"`
	ItemID string      `json:"item_id"`
	// app-side vars
	ID      NullInt64  `json:"id"`
	Product NullString `json:"product"`
	Brewery NullString `json:"brewery"`
	//	Category    NullString  `json:"category"`
	//	CreatedTime time.Time   `json:"created_time"`
}

type CloverJoin struct {
	RestaurantID int    `json:"restaurant_id"`
	AppVersionID int    `json:"app_version_id"`
	POSItemID    string `json:"pos_item_id"`
}

var clover_db *sql.DB

func setupPOSCloverHandlers() {
	http.HandleFunc("/pos/clover", posCloverAPIHandler)
	http.HandleFunc("/pos/clover/match", posCloverMatchAPIHandler)
}

func posCloverMatchAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {

	// A POST relates a clover item to our in-app beverages by adding an
	// entry into the clover_join table
	case "POST":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		var cjoin CloverJoin
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&cjoin)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println(cjoin)

		// check that version_id exists
		vid_exists := false
		err = db.QueryRow(`
			SELECT EXISTS(
				SELECT 1 FROM beverages WHERE restaurant_id=$1 AND version_id=$2);`,
			cjoin.RestaurantID, cjoin.AppVersionID).Scan(
			&vid_exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if !vid_exists {
			log.Println("Posted version_id does not exist, quitting...")
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// if the pos_item_id was already associated with an app_version_id,
		// delete that existing entry.  pos_item_id is unique, and can only be
		// associated with ONE app_version_id (although the converse is not true)
		_, _ = db.Exec(`
			DELETE FROM clover_join 
			WHERE restaurant_id=$1 AND pos_item_id=$2;`,
			cjoin.RestaurantID, cjoin.POSItemID)

		_, err = db.Exec(`
			INSERT INTO clover_join VALUES($1, $2, $3);`,
			cjoin.RestaurantID, cjoin.AppVersionID, cjoin.POSItemID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

	}
}

func posCloverAPIHandler(w http.ResponseWriter, r *http.Request) {

	privilege := checkUserPrivilege()

	switch r.Method {

	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}
		connectToCloverDB()

		_start_date := r.URL.Query().Get("start_date")
		_end_date := r.URL.Query().Get("end_date")
		//tz_str, _ := getRestaurantTimeZone(test_restaurant_id) // not currently used
		// if no dates were provided, set start date to 1 month ago and end date
		// to now
		var start_date time.Time
		var end_date time.Time
		if len(_start_date) == 0 || len(_end_date) == 0 {
			start_date = time.Now().UTC()
			// 1 month ago
			end_date = time.Now().AddDate(0, -1, 0).UTC()
		} else {
			const parseLongForm = "2006-01-02T15:04:05.000Z"
			start_date, _ = time.Parse(parseLongForm, _start_date)
			end_date, _ = time.Parse(parseLongForm, _end_date)
		}

		// clover stores items in datetime, not timestamp, so there is no timezone,
		// and the timestamp is not in UTC, but in the timezone of the restaurant.
		log.Println(start_date)
		log.Println(end_date)

		/*
		   SELECT SUM(price)/100.0 AS total, count(id) AS cnt, order_items.name, order_items.price/100.0
		   FROM itemcat, order_items, orders
		   WHERE orders.id = order_items.orderRef AND order_items.name = itemcat.name
		   AND current = 1 AND food_bev_cat='beverage' AND
		   order_items.createdTime BETWEEN ? and ? AND state = 'locked'
		   GROUP BY order_items.name ORDER BY total DESC;
		*/

		/*
		   SELECT SUM(price)/100.0 AS total, count(id) AS cnt, order_items.name, price/100.0
		     FROM order_items, itemcat
		     WHERE itemcat.name=order_items.name AND itemcat.activeOnMenu = 'true'
		     AND itemcat.current = 1
		     AND createdTime>=? AND createdTime<=?
		     AND food_bev_cat='beverage' GROUP BY name
		     ORDER BY total DESC;
		*/

		// SELECT SUM(price)/100.0 AS total, count(id) AS cnt, order_items.name, price/100.0 FROM order_items, itemcat WHERE itemcat.name=order_items.name AND itemcat.activeOnMenu = 'true' AND itemcat.current = 1 AND createdTime>='2016-02-19 00:00:00' AND createdTime<='2016-02-19 23:59:59' AND food_bev_cat='beverage' GROUP BY name ORDER BY total DESC;
		rows, err := clover_db.Query(`
      SELECT SUM(order_items.price)/100.0 AS total, 
      COUNT(order_items.id) AS cnt, order_items.name, order_items.price/100.0, 
      order_items.item 
      FROM itemcat, order_items, orders 
      WHERE orders.id=order_items.orderRef AND order_items.name=itemcat.name 
      AND itemcat.current=1 AND food_bev_cat='beverage' AND 
      order_items.createdTime>=? AND order_items.createdTime<=? AND state = 'locked' 
      GROUP BY order_items.name ORDER BY total DESC;`, start_date, end_date)
		if err != nil {
			log.Println(err.Error)
		}

		var csales []CloverSale
		defer rows.Close()
		for rows.Next() {
			//var created_time time.Time
			var csale CloverSale
			if err := rows.Scan(
				&csale.Total,
				&csale.Count,
				&csale.Name,
				&csale.Price,
				&csale.ItemID); err != nil {
				log.Println("ERROR")
				log.Println(err.Error)
				continue
			}
			csales = append(csales, csale)
		}

		// now link the entries in csales to our app using the clover_join DB
		for i, csale := range csales {
			err := db.QueryRow(`
				SELECT beverages.id, beverages.product, beverages.brewery 
				FROM beverages, clover_join 
				WHERE beverages.restaurant_id=$1 AND clover_join.restaurant_id=$1 
				AND beverages.current=TRUE AND 
				beverages.version_id=clover_join.app_version_id AND 
				clover_join.pos_item_id=$2;`, test_restaurant_id, csale.ItemID).Scan(
				&csales[i].ID,
				&csales[i].Product,
				&csales[i].Brewery)
			switch {
			case err == sql.ErrNoRows:
				csale.ID.Valid = false
			case err != nil:
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&csales)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)
	}
}

func connectToCloverDB() {

	// XXX Need to maintain an independently opened pos db per restaurant,
	// and close the db connection after a certain time period of disuse
	if clover_db != nil {
		log.Println("Refreshing DB connection via ping...")
		clover_db.Ping()
		return
	}

	var err error
	log.Println("Connecting to clover db...")
	clover_db, err = sql.Open("mysql",
		"jcr_user:bierhaus@tcp(ec2-52-10-109-104.us-west-2.compute.amazonaws.com:3306)/bierha?parseTime=true")
	if err != nil {
		log.Println(err.Error)
	}

	// don't close the db connection!
	//defer clover_db.Close()

}
