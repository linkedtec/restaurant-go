package main

import (
	"database/sql"
	"encoding/json"
	_ "github.com/go-sql-driver/mysql"
	"log"
	"net/http"
	"strconv"
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
	VersionID     int        `json:"version_id"`
	ID            NullInt64  `json:"id"`
	Product       NullString `json:"product"`
	Brewery       NullString `json:"brewery"`
	ServingVolume float64    `json:"volume"`
	ServingUnit   string     `json:"unit"`
	ServingPrice  float64    `json:"app_price"`
	//	Category    NullString  `json:"category"`
	//	CreatedTime time.Time   `json:"created_time"`
}

type CloverJoin struct {
	RestaurantID int     `json:"restaurant_id"`
	VersionID    int     `json:"version_id"`
	POSItemID    string  `json:"pos_item_id"`
	SellVolume   float64 `json:"sell_volume"`
	SellUnit     string  `json:"sell_unit"`
	BeverageID   int     `json:"beverage_id"`
	SizePricesID int     `json:"size_prices_id"`
}

var clover_db *sql.DB

func setupPOSCloverHandlers() {
	http.HandleFunc("/pos/clover", sessionDecorator(posCloverAPIHandler, g_basic_privilege))
	http.HandleFunc("/pos/clover/match", sessionDecorator(posCloverMatchAPIHandler, g_basic_privilege))
}

func batchGetUnitsSoldInPeriodClover(margins []Margin, restaurant_id string, clover_db *sql.DB) ([]CloverSale, error) {

	var csales []CloverSale

	// First get the matching clover item id, sale volume to margins' version_ids
	// from our own DB
	// Need to build a string with (VALUES($version_id1), ($version_id2))
	// from the margins slice
	// XXX think through: there can be multiple beverage_ids in clover_join in
	// a time period due to history, how do we handle that?
	version_ids_str := "(VALUES"
	for i, margin := range margins {
		if i > 0 {
			version_ids_str += ","
		}
		version_ids_str += "(" + strconv.Itoa(margin.VersionID) + ")"
	}
	version_ids_str += ")"

	log.Println(version_ids_str)

	rows, err := db.Query(`
		SELECT clover_join.version_id, clover_join.pos_item_id, 
			size_prices.serving_size, size_prices.serving_unit 
		FROM clover_join, size_prices, `+version_ids_str+` 
			AS t (version_id) 
		WHERE clover_join.restaurant_id=$1 AND clover_join.version_id=t.version_id 
		AND clover_join.size_prices_id=size_prices.id 
		GROUP BY clover_join.version_id, clover_join.pos_item_id, size_prices.serving_size, size_prices.serving_unit 
		ORDER BY clover_join.version_id DESC;`,
		restaurant_id)
	if err != nil {
		log.Println(err.Error())
		return csales, err
	}

	// Now that we have the item_id, match the item_id to the margin, and use
	// the item_id, version_id, inv_update1, inv_update2 to find the clover sales
	// within the period

	// store by version_id into a map so matching to margins is O(n) instead of
	// O(n^2).  Note that a version_id can have multiple csale entries due
	// to multipe size prices
	csale_map_version_id := make(map[int][]CloverSale)
	csale_map_item_id := make(map[string]CloverSale)

	defer rows.Close()
	for rows.Next() {

		var csale CloverSale

		if err := rows.Scan(
			&csale.VersionID,
			&csale.ItemID,
			&csale.ServingVolume,
			&csale.ServingUnit); err != nil {
			log.Println(err.Error())
			continue
		}
		csale_map_version_id[csale.VersionID] = append(csale_map_version_id[csale.VersionID], csale)
		csale_map_item_id[csale.ItemID] = csale
	}

	log.Println("PRINTING csale_map:")
	log.Println(csale_map_version_id)

	// we're going to shove all the ItemIDs and inv update dates into 1
	// temporary table to feed the clover DB, so as we don't incur costs of
	// individual connections per item.  So we need to construct the string
	// which looks like this:
	//
	// SELECT 'ABCDEFG' AS item, '2016-03-08 22:34:53' AS date1, '2016-03-10 22:34:53' AS date2
	// UNION ALL
	// SELECT 'HIJKLMNOP' AS item, '2016-03-01 22:34:53' AS date1, '2016-03-15 22:34:53' AS date2

	tmp_items_dates_table := "("
	for i, margin := range margins {

		csales := csale_map_version_id[margin.VersionID]

		for j, csale := range csales {

			if i > 0 || j > 0 {
				tmp_items_dates_table += " UNION ALL "
			}

			const format_layout = "2006-01-02 15:04:05"
			start_date_str := margin.InvUpdate1.Format(format_layout)
			end_date_str := margin.InvUpdate2.Format(format_layout)

			// XXX need to format InvUpdate1
			tmp_items_dates_table += "SELECT '" + csale.ItemID + "' AS item, '"
			tmp_items_dates_table += start_date_str + "' AS date1, '"
			tmp_items_dates_table += end_date_str + "' AS date2"
		}
	}
	tmp_items_dates_table += ")"

	//log.Println("PRINTING TMP UNION TABLE: ")
	//log.Println(tmp_items_dates_table)

	sale_rows, err := clover_db.Query(`
    SELECT order_items.item, COUNT(order_items.price), SUM(COALESCE(order_items.price, 0))/100.0 AS total 
	   	FROM order_items 
	   	INNER JOIN itemcat ON order_items.name=itemcat.name 
	   	INNER JOIN orders ON orders.id=order_items.orderRef 
	   	INNER JOIN ` + tmp_items_dates_table + ` AS items_dates ON order_items.item=items_dates.item 
	   WHERE itemcat.current=1 AND food_bev_cat='beverage' AND state='locked' 
	   AND order_items.createdTime >= items_dates.date1 AND order_items.createdTime <= items_dates.date2 
	   GROUP BY items_dates.item;`)
	if err != nil {
		log.Println(err.Error)
		return csales, err
	}

	defer sale_rows.Close()
	for sale_rows.Next() {
		var csale CloverSale

		if err := sale_rows.Scan(
			&csale.ItemID,
			&csale.Count,
			&csale.Total); err != nil {
			log.Println(err.Error())
			continue
		}
		csales = append(csales, csale)
	}

	// csales currently has
	//     item_id, count, and total sales data
	// Need to combine it with csale_map data, which has
	//     version_id, item_id, serving_volume, serving_unit
	// matching based on ItemID
	for i, csale := range csales {
		_csale := csale_map_item_id[csale.ItemID]
		csales[i].VersionID = _csale.VersionID
		csales[i].ServingVolume = _csale.ServingVolume
		csales[i].ServingUnit = _csale.ServingUnit
	}

	return csales, nil
}

func getTotalUnitsSoldInPeriodClover(version_id int,
	start_date time.Time, end_date time.Time, restaurant_id string,
	clover_db *sql.DB) ([]CloverSale, error) {

	var csales []CloverSale

	// note that there can be multiple PoS items per version id (since there
	// can be multiple sales points), so we query for multiple rows
	rows, err := db.Query(`
		SELECT clover_join.pos_item_id, 
			size_prices.serving_size, size_prices.serving_unit 
		FROM clover_join 
		INNER JOIN size_prices ON (clover_join.size_prices_id=size_prices.id) 
		WHERE clover_join.restaurant_id=$1 AND clover_join.version_id=$2 
		GROUP BY clover_join.pos_item_id, size_prices.serving_size, size_prices.serving_unit;`,
		restaurant_id, version_id)
	if err != nil {
		log.Println(err.Error())
		return csales, err
	}

	defer rows.Close()
	for rows.Next() {

		var csale CloverSale

		if err := rows.Scan(
			&csale.ItemID,
			&csale.ServingVolume,
			&csale.ServingUnit); err != nil {
			log.Println(err.Error())
			continue
		}

		// For testing validity:
		//     Tests sum over period of single item:
		// SELECT SUM(COALESCE(order_items.price, 0))/100.0 AS total FROM itemcat, order_items, orders WHERE orders.id=order_items.orderRef AND order_items.name=itemcat.name AND order_items.item='CX5TXMT46DTN4' AND itemcat.current=1 AND food_bev_cat='beverage' AND order_items.createdTime>='2016-03-01 21:33:13' AND state = 'locked';
		//     Prints individual occurrences of item over same period:
		// SELECT order_items.createdTime, order_items.name, order_items.price AS total FROM itemcat, order_items, orders WHERE orders.id=order_items.orderRef AND order_items.name=itemcat.name AND order_items.item='CX5TXMT46DTN4' AND itemcat.current=1 AND food_bev_cat='beverage' AND order_items.createdTime>='2016-03-01 21:33:13' AND state = 'locked';

		// note: each item on PoS shares a unique id column 'order_items.item',
		// not to be confused with 'order_items.id', which is a unique id per
		// TRANSACTION

		err = clover_db.QueryRow(`
      SELECT COUNT(order_items.price), SUM(COALESCE(order_items.price, 0))/100.0 AS total 
      FROM itemcat, order_items, orders 
      WHERE orders.id=order_items.orderRef AND order_items.name=itemcat.name 
      AND order_items.item=? 
      AND itemcat.current=1 AND food_bev_cat='beverage' AND 
      order_items.createdTime>=? AND order_items.createdTime<=? 
      AND state = 'locked';`, csale.ItemID, start_date, end_date).Scan(
			&csale.Count,
			&csale.Total)
		if err != nil {
			log.Println(err.Error)
			continue
		}

		csales = append(csales, csale)

	}

	return csales, nil

}

func getTotalSalesInPeriodClover(version_id int,
	start_date time.Time, end_date time.Time, restaurant_id string) (NullFloat64, error) {

	var item_total NullFloat64
	item_total.Valid = false
	item_total.Float64 = 0

	// note that there can be multiple PoS items per version id (since there
	// can be multiple sales points), so we query for multiple rows
	rows, err := db.Query(`
		SELECT pos_item_id FROM clover_join 
		WHERE restaurant_id=$1 AND version_id=$2;`, restaurant_id, version_id)
	if err != nil {
		log.Println(err.Error())
		return item_total, err
	}

	connectToCloverDB()

	defer rows.Close()
	for rows.Next() {

		var pos_id string

		if err := rows.Scan(
			&pos_id); err != nil {
			log.Println(err.Error())
			continue
		}

		// For testing validity:
		//     Tests sum over period of single item:
		// SELECT SUM(COALESCE(order_items.price, 0))/100.0 AS total FROM itemcat, order_items, orders WHERE orders.id=order_items.orderRef AND order_items.name=itemcat.name AND order_items.item='CX5TXMT46DTN4' AND itemcat.current=1 AND food_bev_cat='beverage' AND order_items.createdTime>='2016-03-01 21:33:13' AND state = 'locked';
		//     Prints individual occurrences of item over same period:
		// SELECT order_items.createdTime, order_items.name, order_items.price AS total FROM itemcat, order_items, orders WHERE orders.id=order_items.orderRef AND order_items.name=itemcat.name AND order_items.item='CX5TXMT46DTN4' AND itemcat.current=1 AND food_bev_cat='beverage' AND order_items.createdTime>='2016-03-01 21:33:13' AND state = 'locked';

		// note: each item on PoS shares a unique id column 'order_items.item',
		// not to be confused with 'order_items.id', which is a unique id per
		// TRANSACTION
		var this_sale float64
		err = clover_db.QueryRow(`
      SELECT SUM(COALESCE(order_items.price, 0))/100.0 AS total 
      FROM itemcat, order_items, orders 
      WHERE orders.id=order_items.orderRef AND order_items.name=itemcat.name 
      AND order_items.item=? 
      AND itemcat.current=1 AND food_bev_cat='beverage' AND 
      order_items.createdTime>=? AND order_items.createdTime<=? 
      AND state = 'locked';`, pos_id, start_date, end_date).Scan(&this_sale)
		if err != nil {
			log.Println(err.Error)
			continue
		}
		item_total.Float64 += this_sale
	}

	item_total.Valid = true
	return item_total, nil
}

func posCloverMatchAPIHandler(w http.ResponseWriter, r *http.Request) {

	_, restaurant_id, err := sessionGetUserAndRestaurant(w, r)
	if err != nil {
		return
	}

	switch r.Method {

	// A POST relates a clover item to our in-app beverages by adding an
	// entry into the clover_join table
	case "POST":

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
		err = db.QueryRow(`
				SELECT beverages.id, size_prices.id FROM size_prices, beverages 
				WHERE beverages.restaurant_id=$1 AND beverages.version_id=$2 
				AND beverages.current=TRUE 
				AND size_prices.serving_size=$3 AND size_prices.serving_unit=$4 
				AND size_prices.beverage_id=beverages.id;`,
			restaurant_id, cjoin.VersionID, cjoin.SellVolume, cjoin.SellUnit).Scan(
			&cjoin.BeverageID,
			&cjoin.SizePricesID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		_, err = db.Exec(`
			INSERT INTO clover_join VALUES($1, $2, $3, $4, $5);`,
			cjoin.RestaurantID, cjoin.POSItemID, cjoin.VersionID, cjoin.BeverageID, cjoin.SizePricesID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

	}
}

func posCloverAPIHandler(w http.ResponseWriter, r *http.Request) {

	_, restaurant_id, err := sessionGetUserAndRestaurant(w, r)
	if err != nil {
		return
	}

	// XXX Hacky, currently only do clover PoS for Bierhaus
	if restaurant_id != "1" {
		return
	}

	switch r.Method {

	case "GET":

		connectToCloverDB()

		_start_date := r.URL.Query().Get("start_date")
		_end_date := r.URL.Query().Get("end_date")
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
				SELECT beverages.id, beverages.product, beverages.brewery,
					size_prices.serving_size, size_prices.serving_unit, size_prices.serving_price  
				FROM beverages, clover_join, size_prices 
				WHERE beverages.restaurant_id=$1 AND clover_join.restaurant_id=$1 
				AND beverages.current=TRUE 
				AND size_prices.beverage_id=beverages.id 
				AND beverages.version_id=clover_join.version_id 
				AND clover_join.size_prices_id=size_prices.id 
				AND clover_join.pos_item_id=$2 LIMIT 1;`, restaurant_id, csale.ItemID).Scan(
				&csales[i].ID,
				&csales[i].Product,
				&csales[i].Brewery,
				&csales[i].ServingVolume,
				&csales[i].ServingUnit,
				&csales[i].ServingPrice)
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
