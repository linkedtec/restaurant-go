package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type Margin struct {
	VersionID        int         `json:"version_id"`
	Product          string      `json:"product"`
	Brewery          NullString  `json:"brewery"`
	PurchaseVolume   NullFloat64 `json:"purchase_volume"`
	PurchaseUnit     NullString  `json:"purchase_unit"`
	PurchaseCount    int         `json:"purchase_count"`
	PurchaseCost     NullFloat64 `json:"purchase_cost"`
	InvTimes         int         `json:"inv_times"`
	InvUpdate1       time.Time   `json:"inv_update1"`
	InvUpdate2       time.Time   `json:"inv_update2"`
	InvQuantity1     NullFloat64 `json:"inv_quantity1"`
	InvQuantity2     NullFloat64 `json:"inv_quantity2"`
	DeliveriesCount  NullFloat64 `json:"deliveries_count"`
	TotalSales       NullFloat64 `json:"total_sales"`
	VolumeInvL1      float64     `json:"vol_inv_L_1"`
	VolumeInvL2      float64     `json:"vol_inv_L_2"`
	VolumeSoldL      float64     `json:"vol_sold_L"`
	VolumeDeliveredL float64     `json:"vol_delivered_L"`
	VolumeWasteL     float64     `json:"vol_waste_L"`
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
        brewery, 
        inv_times (# of inv records in all history), 
        purchase_volume (of most recent beverage_id), 
        purchase_unit, 
        purchase_count, 
        purchase_cost, 
        inv_update1 (second latest inventory update time) 
        inv_update2 (latest inventory update time) 
        inv_qty1 (total quantity ordered at inv_update_1 DATE), 
        inv_qty2, 
        deliveries_sum (sum of all deliveries in the inventory period b/w updates 1 and 2)
      */
      WITH inv_dates_and_delivery_qty AS (
        WITH final_two_inv_bevs AS (
          /* START final_two_inv_bevs query */
          WITH two_inv_bevs AS (
            SELECT * FROM (
              /* in_clover_ids gets all available version_ids from clover_join for 
               this restaurant. This will let us discard any inventory records 
               which do not have associated sales data, since we can't calculate
               margins for those */
              WITH in_clover_ids AS (
                SELECT DISTINCT version_id FROM clover_join WHERE restaurant_id=$1
              ), 
              versioned_updates AS (
                /* more_than_two_inv_bevs are inventory records of version_id'ed 
                   beverages which have more than 2 records, since we need a start and 
                   and end period to calculate margins.  inv_times column tracks how many 
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
                  beverages.version_id, location_beverages.beverage_id, 
                  beverages.product, beverages.brewery, 
                  beverages.purchase_volume, beverages.purchase_unit, 
                  beverages.purchase_count, beverages.purchase_cost, 
                  location_beverages.update, (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $2)::date 
                  FROM location_beverages 
                    INNER JOIN beverages ON (beverages.id=location_beverages.beverage_id) 
                  WHERE beverages.restaurant_id=$1 AND location_beverages.active IS TRUE 
                  AND location_beverages.type='bev' 
                  ORDER BY (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $2)::date DESC
                )
                SELECT version_id_dates.beverage_id, version_id_dates.product, 
                version_id_dates.brewery, 
                version_id_dates.version_id, version_id_dates.purchase_volume, 
                version_id_dates.purchase_unit, 
                version_id_dates.purchase_count, version_id_dates.purchase_cost, 
                more_than_two_inv_bevs.inv_times, version_id_dates.update  
                FROM more_than_two_inv_bevs, version_id_dates 
                WHERE version_id_dates.version_id=more_than_two_inv_bevs.version_id 
                ORDER BY more_than_two_inv_bevs.version_id
              ) 
              SELECT beverage_id, product, brewery, versioned_updates.version_id, 
                purchase_volume, purchase_unit, purchase_count, purchase_cost, 
                inv_times, update, 
              rank() OVER (PARTITION BY versioned_updates.version_id ORDER BY update DESC) AS inv_date_rank FROM in_clover_ids, versioned_updates 
              WHERE in_clover_ids.version_id=versioned_updates.version_id 
            ) q2 WHERE inv_date_rank <=2
          ),
          /* rank_one_bevs are the most recent unique inventory dates for each bev,
             rank_two_bevs are the second-most recent unique inventory dates */
          rank_one_bevs AS (
            SELECT * FROM two_inv_bevs WHERE inv_date_rank=1),
          rank_two_bevs AS (
            SELECT * FROM two_inv_bevs WHERE inv_date_rank=2) 
          SELECT rank_one_bevs.beverage_id, rank_one_bevs.product, 
          rank_one_bevs.brewery, rank_one_bevs.version_id, 
          rank_one_bevs.inv_times, rank_one_bevs.purchase_volume, 
          rank_one_bevs.purchase_unit, rank_one_bevs.purchase_count, 
          rank_one_bevs.purchase_cost, 
          rank_two_bevs.update AS inv_update1, rank_one_bevs.update AS inv_update2 
          FROM rank_one_bevs, rank_two_bevs WHERE rank_one_bevs.version_id=rank_two_bevs.version_id
          /* END final_two_inv_bevs query */
        ) 
        SELECT final_two_inv_bevs.version_id, final_two_inv_bevs.product, 
        final_two_inv_bevs.brewery, 
        final_two_inv_bevs.inv_times, final_two_inv_bevs.purchase_volume, 
        final_two_inv_bevs.purchase_unit, final_two_inv_bevs.purchase_count, 
        final_two_inv_bevs.purchase_cost, 
        final_two_inv_bevs.inv_update1, 
        final_two_inv_bevs.inv_update2, SUM(COALESCE(do_item_deliveries.quantity, distributor_order_items.quantity)) AS deliveries_qty 
        FROM final_two_inv_bevs 
          INNER JOIN beverages ON (final_two_inv_bevs.version_id=beverages.version_id) 
          LEFT OUTER JOIN do_item_deliveries ON (beverages.id=do_item_deliveries.beverage_id) 
          LEFT OUTER JOIN do_deliveries ON (do_item_deliveries.distributor_order_id=do_deliveries.distributor_order_id 
            AND do_deliveries.delivery_time > final_two_inv_bevs.inv_update1 
            AND do_deliveries.delivery_time < final_two_inv_bevs.inv_update2) 
          LEFT OUTER JOIN distributor_order_items ON (
            distributor_order_items.distributor_order_id=do_item_deliveries.distributor_order_id AND 
            distributor_order_items.beverage_id=do_item_deliveries.beverage_id) 
        GROUP BY final_two_inv_bevs.version_id, final_two_inv_bevs.product, 
        final_two_inv_bevs.brewery, 
        final_two_inv_bevs.purchase_volume, final_two_inv_bevs.purchase_unit, 
        final_two_inv_bevs.purchase_count, final_two_inv_bevs.purchase_cost, 
        final_two_inv_bevs.inv_times, final_two_inv_bevs.inv_update1, 
        final_two_inv_bevs.inv_update2
      ),
      inv_sum_table1 AS (
        SELECT SUM(location_beverages.quantity) AS qty, 
        beverages.version_id as version_id 
        FROM inv_dates_and_delivery_qty, location_beverages, beverages 
        WHERE beverages.version_id=inv_dates_and_delivery_qty.version_id AND 
          location_beverages.beverage_id=beverages.id AND 
          (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $2)::date=(inv_dates_and_delivery_qty.inv_update1 AT TIME ZONE 'UTC' AT TIME ZONE $2)::date 
          GROUP BY beverages.version_id
      ), 
      inv_sum_table2 AS (
      SELECT SUM(location_beverages.quantity) AS qty, 
        beverages.version_id as version_id 
        FROM inv_dates_and_delivery_qty, location_beverages, beverages 
        WHERE beverages.version_id=inv_dates_and_delivery_qty.version_id AND 
          location_beverages.beverage_id=beverages.id AND 
          (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $2)::date=(inv_dates_and_delivery_qty.inv_update2 AT TIME ZONE 'UTC' AT TIME ZONE $2)::date 
          GROUP BY beverages.version_id
      ) 
      SELECT inv_dates_and_delivery_qty.version_id, 
        inv_dates_and_delivery_qty.product, 
        inv_dates_and_delivery_qty.brewery, 
        inv_dates_and_delivery_qty.inv_times, 
        inv_dates_and_delivery_qty.purchase_volume, 
        inv_dates_and_delivery_qty.purchase_unit, 
        inv_dates_and_delivery_qty.purchase_count, 
        inv_dates_and_delivery_qty.purchase_cost, 
        inv_dates_and_delivery_qty.inv_update1, 
        inv_dates_and_delivery_qty.inv_update2, 
        inv_sum_table1.qty AS inv_qty1, 
        inv_sum_table2.qty AS inv_qty2, 
        inv_dates_and_delivery_qty.deliveries_qty 
      FROM 
        inv_dates_and_delivery_qty, inv_sum_table1, inv_sum_table2 WHERE 
        inv_sum_table1.version_id=inv_dates_and_delivery_qty.version_id AND 
        inv_sum_table2.version_id=inv_dates_and_delivery_qty.version_id;
      `, restaurant_id, tz_str)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		connectToCloverDB()

		defer rows.Close()
		for rows.Next() {
			var margin Margin
			if err := rows.Scan(
				&margin.VersionID,
				&margin.Product,
				&margin.Brewery,
				&margin.InvTimes,
				&margin.PurchaseVolume,
				&margin.PurchaseUnit,
				&margin.PurchaseCount,
				&margin.PurchaseCost,
				&margin.InvUpdate1,
				&margin.InvUpdate2,
				&margin.InvQuantity1,
				&margin.InvQuantity2,
				&margin.DeliveriesCount); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			log.Println(margin)

			// we must have the PurchaseVolume and PurchaseUnit, otherwise we
			// can't calculate by volumes
			if !margin.PurchaseVolume.Valid || !margin.PurchaseUnit.Valid {
				continue
			}

			margins = append(margins, margin)
		}

		clover_sales, err := batchGetUnitsSoldInPeriodClover(margins, restaurant_id, clover_db)

		log.Println(clover_sales)

		csale_map_version_id := make(map[int][]CloverSale)
		for _, csale := range clover_sales {
			csale_map_version_id[csale.VersionID] = append(csale_map_version_id[csale.VersionID], csale)
		}

		vumap := getVolumeUnitsMap()

		for i, margin := range margins {
			purch_vol_in_liters := getVolumeInLiters(margin.PurchaseVolume, margin.PurchaseUnit, vumap)
			margins[i].VolumeInvL1 = margin.InvQuantity1.Float64 * purch_vol_in_liters.Float64
			margins[i].VolumeInvL2 = margin.InvQuantity2.Float64 * purch_vol_in_liters.Float64
			margins[i].VolumeDeliveredL = margin.DeliveriesCount.Float64 * purch_vol_in_liters.Float64 * float64(margin.PurchaseCount)

			margin_csales := csale_map_version_id[margin.VersionID]

			for _, csale := range margin_csales {
				log.Println(csale)
				serving_vol := csale.ServingVolume
				serving_unit := csale.ServingUnit
				if serving_unit == "Unit" || serving_unit == "unit" {
					serving_vol = margin.PurchaseVolume.Float64
					serving_unit = margin.PurchaseUnit.String
				}
				sale_count := csale.Count.Int64

				var _serving_vol NullFloat64
				_serving_vol.Float64 = serving_vol
				_serving_vol.Valid = true
				var _serving_unit NullString
				_serving_unit.String = serving_unit
				_serving_unit.Valid = true
				vol_in_liters := getVolumeInLiters(_serving_vol, _serving_unit, vumap)
				vol_sold := float64(sale_count) * vol_in_liters.Float64

				margins[i].VolumeSoldL += vol_sold
			}

			// if there was no volume sold, there's nothing to calculate!
			if margins[i].VolumeSoldL == 0 {
				log.Println("no volume")
				continue
			}

			//     waste = inventory_old - inventory_new + deliveries - sales
			// utilization = sales / (sales + waste)
			margins[i].VolumeWasteL = margins[i].VolumeInvL1 - margins[i].VolumeInvL2 + margin.VolumeDeliveredL - margins[i].VolumeSoldL

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
