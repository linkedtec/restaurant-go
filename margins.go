package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type Margin struct {
	VersionID     int         `json:"version_id"`
	Product       string      `json:"product"`
	InvTimes      int         `json:"inv_times"`
	InvUpdate1    time.Time   `json:"inv_update1"`
	InvUpdate2    time.Time   `json:"inv_update2"`
	DeliveriesSum NullFloat64 `json:"deliveries_sum"`
}

func setupMarginsHandlers() {
	http.HandleFunc("/margins", marginsAPIHandler)
}

func marginsAPIHandler(w http.ResponseWriter, r *http.Request) {

	privilege := checkUserPrivilege()

	switch r.Method {

	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		restaurant_id := r.URL.Query().Get("restaurant_id")
		//margin_type := r.URL.Query().Get("margin_type")
		tz_str, _ := getRestaurantTimeZone(restaurant_id)

		// To calculate margins, first we calculate waste from the available data,
		// like so:
		//
		//     inventory_old + deliveries - sales - waste = inventory_new
		//
		// We can get inventory_old, inventory_new, deliveries, and sales all from
		// our DB, so waste is the only unknown.
		//
		// 1. With one huge query, we get all the beverages (version_id) which
		//      a. have two unique date records in inventory
		//      b. have an associated sales record on PoS
		//      c. get their deliveries, if any, in the same period
		//  2. For each unique beverage:
		//      a. Get associated sales from Pos DB.  If there are no sales, discard
		//      b. Calculate waste

		var margins []Margin
		rows, err := db.Query(
			`
      /* The final result of this query has the following columns:
         version_id, 
         product, 
         inv_times (# of inv records in all history), 
         inv_update1 (second latest inventory update time) 
         inv_update2 (latest inventory update time) 
         deliveries_sum (sum of all deliveries in the inventory period b/w updates 1 and 2)
      */
      WITH final_two_inv_bevs AS (
        WITH two_inv_bevs AS (
          SELECT * FROM (
            /* in_clover_ids gets all available version_ids from clover_join for 
             this restaurant. This will let us discard any inventory records 
             which do not have associated sales data, since we can't calculate
             margins for those */
            WITH in_clover_ids AS (
              SELECT DISTINCT app_version_id FROM clover_join WHERE restaurant_id=$1
            ), 
            versioned_updates AS (
              /* more_than_two_inv_bevs are inventory records of version_id'ed 
                 beverages which have more than 2 records, since we need a start and 
                 an end period to calculate margins.  inv_times column tracks how many 
                 times this beverage has been recorded in inventory */
              WITH more_than_two_inv_bevs AS (
                SELECT * FROM (
                  SELECT beverages.version_id, COUNT(beverages.version_id) AS inv_times 
                  FROM location_beverages 
                    INNER JOIN beverages ON (beverages.id=location_beverages.beverage_id) 
                  WHERE beverages.restaurant_id=$1 
                  GROUP BY beverages.version_id) q1 WHERE inv_times > 1
              ),
              /* version_id_dates is beverage_id and unique update time (one per 
                 date) for each inventory entry so we can associate those with 
                 more_than_two_inv_bevs based on their matching version_ids */
              version_id_dates AS (
                SELECT DISTINCT ON ((location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $2)::date, beverages.version_id) 
                beverages.version_id, location_beverages.beverage_id, beverages.product, 
                location_beverages.update, (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $2)::date 
                FROM location_beverages 
                  INNER JOIN beverages ON (beverages.id=location_beverages.beverage_id) 
                WHERE beverages.restaurant_id=$1 AND location_beverages.active IS TRUE 
                AND location_beverages.type='bev' 
                ORDER BY (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $2)::date DESC
              )
              SELECT version_id_dates.beverage_id, version_id_dates.product, 
              version_id_dates.version_id, more_than_two_inv_bevs.inv_times, version_id_dates.update  
              FROM more_than_two_inv_bevs, version_id_dates 
              WHERE version_id_dates.version_id=more_than_two_inv_bevs.version_id 
              ORDER BY more_than_two_inv_bevs.version_id
            ) 
          SELECT beverage_id, product, version_id, inv_times, update, 
          rank() OVER (PARTITION BY version_id ORDER BY update DESC) AS inv_date_rank FROM in_clover_ids, versioned_updates 
          WHERE in_clover_ids.app_version_id=versioned_updates.version_id
        ) q2 WHERE inv_date_rank <=2),
        /* rank_one_bevs are the most recent unique inventory dates for each bev,
           rank_two_bevs are the second-most recent unique inventory dates */
        rank_one_bevs AS (
          SELECT * FROM two_inv_bevs WHERE inv_date_rank=1),
        rank_two_bevs AS (
          SELECT * FROM two_inv_bevs WHERE inv_date_rank=2) 
        SELECT rank_one_bevs.beverage_id, rank_one_bevs.product, rank_one_bevs.version_id, rank_one_bevs.inv_times,
        rank_two_bevs.update AS inv_update1, rank_one_bevs.update AS inv_update2 
        FROM rank_one_bevs, rank_two_bevs WHERE rank_one_bevs.version_id=rank_two_bevs.version_id
      ) 
      SELECT final_two_inv_bevs.version_id, final_two_inv_bevs.product, 
      final_two_inv_bevs.inv_times, final_two_inv_bevs.inv_update1, 
      final_two_inv_bevs.inv_update2, SUM(COALESCE(do_item_deliveries.invoice, distributor_order_items.subtotal)) AS deliveries_sum 
      FROM final_two_inv_bevs 
        INNER JOIN beverages ON (final_two_inv_bevs.version_id=beverages.version_id) 
        LEFT OUTER JOIN do_item_deliveries ON (beverages.id=do_item_deliveries.beverage_id) 
        LEFT OUTER JOIN do_deliveries ON (do_item_deliveries.distributor_order_id=do_deliveries.distributor_order_id) 
        LEFT OUTER JOIN distributor_order_items ON (
          distributor_order_items.distributor_order_id=do_item_deliveries.distributor_order_id AND 
          distributor_order_items.beverage_id=do_item_deliveries.beverage_id) 
      WHERE do_deliveries.delivery_time > final_two_inv_bevs.inv_update1 
      AND do_deliveries.delivery_time < final_two_inv_bevs.inv_update2 
      GROUP BY final_two_inv_bevs.version_id, final_two_inv_bevs.product, 
      final_two_inv_bevs.inv_times, final_two_inv_bevs.inv_update1, 
      final_two_inv_bevs.inv_update2;
      `, restaurant_id, tz_str)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var margin Margin
			if err := rows.Scan(
				&margin.VersionID,
				&margin.Product,
				&margin.InvTimes,
				&margin.InvUpdate1,
				&margin.InvUpdate2,
				&margin.DeliveriesSum); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			log.Println(margin)
			margins = append(margins, margin)
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&margins)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)
	}
}
