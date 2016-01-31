package main

import (
	"encoding/json"
	"log"
	"net/http"
)

func setupMarkupHandlers() {
	http.HandleFunc("/markups", markupAPIHandler)
}

func getVolumeInLiters(
	vol NullFloat64, unit NullString, volume_units_map map[string]float32) NullFloat64 {

	var vol_in_liters NullFloat64
	vol_in_liters.Valid = false
	vol_in_liters.Float64 = 0.0

	if !vol.Valid || !unit.Valid {
		return vol_in_liters
	}

	if in_liters, has_unit := volume_units_map[unit.String]; has_unit {
		vol_in_liters.Float64 = float64(in_liters) * vol.Float64
		vol_in_liters.Valid = true
	}

	return vol_in_liters

}

// @vol is the numeric value of volume
// @unit is a string abbreviation of the unit, i.e., oz, qt, L, mL
// @cost is the wholesale cost of the beverage
// @count is the purchase count of the beverage, e.g., if it's sold in a case
// @volume_units_array associates unit abbreviations to volume in liters
//   for converting e.g., oz to mL
// @cost_unit is the volume unit of the returned cost per volume
func getPricePerVolume(
	vol NullFloat64, unit NullString, cost float32,
	count int, volume_units_map map[string]float32,
	cost_unit string) NullFloat64 {

	var price_per_volume NullFloat64
	price_per_volume.Valid = false
	price_per_volume.Float64 = 0

	if vol.Valid == false || unit.Valid == false {
		return price_per_volume
	}

	if vol.Float64 == 0 {
		return price_per_volume
	}

	if count < 1 {
		return price_per_volume
	}

	vol_in_liters := getVolumeInLiters(vol, unit, volume_units_map)
	if !vol_in_liters.Valid {
		return price_per_volume
	}

	cost_per_mL := float64(cost) / float64(count) / vol_in_liters.Float64 / 1000.0

	// if display is cost / mL
	if cost_unit == "mL" {
		// do nothing
	} else if cost_unit == "oz" {
		cost_per_mL *= 29.5735
	}

	price_per_volume.Float64 = cost_per_mL
	price_per_volume.Valid = true

	return price_per_volume
}

func getVolumeUnitsMap() map[string]float32 {
	vumap := make(map[string]float32)

	rows, err := db.Query("SELECT abbr_name, in_liters FROM volume_units;")
	if err != nil {
		log.Println(err.Error())
		return vumap
	}

	defer rows.Close()
	for rows.Next() {
		var abbr_name string
		var in_liters float32
		if err := rows.Scan(
			&abbr_name,
			&in_liters); err != nil {
			continue
		}
		vumap[abbr_name] = in_liters
	}
	return vumap
}

func getMarkupForSalePrice(sp SalePrice, bev Beverage, vumap map[string]float32) NullFloat64 {

	var markup NullFloat64
	markup.Valid = false
	markup.Float64 = 0

	sale_price := sp.Price
	purchase_cost := bev.PurchaseCost
	purchase_count := bev.PurchaseCount
	sale_units := sp.Volume

	if sp.Unit == "Unit" {
		// unit sales are easy, don't need to take volume in count, just get
		// cost per unit, divide sell price per unit by that
		if !sp.Price.Valid || bev.PurchaseCost == 0 || bev.PurchaseCount == 0 || !sale_units.Valid || sale_units.Float64 == 0 {
			return markup
		}

		markup.Float64 = sale_price.Float64 / (float64(purchase_cost) / float64(purchase_count)) / sale_units.Float64
		markup.Valid = true
	} else {
		// to get the markup for a volume pour, we do the following:
		//     get price per volume for wholesale
		//     get price per volume for single sale
		//     price_per_volume_sale / price_per_volume_wholesale = markup
		price_per_volume_wholesale := getPricePerVolume(
			bev.PurchaseVolume,
			bev.PurchaseUnit,
			bev.PurchaseCost,
			bev.PurchaseCount,
			vumap,
			"mL")
		if !price_per_volume_wholesale.Valid {
			return markup
		}

		var _unit NullString
		_unit.Valid = true
		_unit.String = sp.Unit
		price_per_volume_sale := getPricePerVolume(
			sp.Volume,
			_unit,
			float32(sp.Price.Float64),
			1,
			vumap,
			"mL")
		if !price_per_volume_sale.Valid {
			return markup
		}

		markup.Float64 = price_per_volume_sale.Float64 / price_per_volume_wholesale.Float64
		markup.Valid = true
	}

	return markup
}

func calcMarkupsFromBeverages(bevs []Beverage) (map[string]float32, error) {

	vumap := getVolumeUnitsMap()

	var err error

	markup_totals := make(map[string]float64)
	markup_totals["All"] = 0
	markup_totals["Beers"] = 0
	markup_totals["Ciders"] = 0
	markup_totals["Wines"] = 0
	markup_totals["Liquors"] = 0
	markup_totals["NonAlcoholics"] = 0
	num_size_prices := make(map[string]int)
	num_size_prices["All"] = 0
	num_size_prices["Beers"] = 0
	num_size_prices["Ciders"] = 0
	num_size_prices["Wines"] = 0
	num_size_prices["Liquors"] = 0
	num_size_prices["NonAlcoholics"] = 0
	markups := make(map[string]float32)
	markups["All"] = 0
	markups["Beers"] = 0
	markups["Ciders"] = 0
	markups["Wines"] = 0
	markups["Liquors"] = 0
	markups["NonAlcoholics"] = 0

	for _, bev := range bevs {
		// calculate markups, but only for active (Staple, Seasonal) bevs
		if bev.SaleStatus.String == "Staple" || bev.SaleStatus.String == "Seasonal" {
			sprows, err := db.Query("SELECT id, serving_size, serving_unit, serving_price FROM size_prices WHERE beverage_id=$1;", bev.ID)
			if err != nil {
				log.Println(err.Error())
				continue
			}
			for sprows.Next() {
				var sp SalePrice
				if err := sprows.Scan(
					&sp.ID, &sp.Volume, &sp.Unit, &sp.Price); err != nil {
					log.Println(err.Error())
					continue
				}
				markup := getMarkupForSalePrice(sp, bev, vumap)
				log.Println(bev.Product)
				log.Println(markup)
				// only count valid markups.  0 markups will artificially lower the
				// average
				if markup.Valid == true {
					num_size_prices["All"] += 1
					markup_totals["All"] += markup.Float64
					if bev.AlcoholType == "Beer" {
						markup_totals["Beers"] += markup.Float64
						num_size_prices["Beers"] += 1
					} else if bev.AlcoholType == "Cider" {
						markup_totals["Ciders"] += markup.Float64
						num_size_prices["Ciders"] += 1
					} else if bev.AlcoholType == "Wine" {
						markup_totals["Wines"] += markup.Float64
						num_size_prices["Wines"] += 1
					} else if bev.AlcoholType == "Liquor" {
						markup_totals["Liquors"] += markup.Float64
						num_size_prices["Liquors"] += 1
					} else {
						markup_totals["NonAlcoholics"] += markup.Float64
						num_size_prices["NonAlcoholics"] += 1
					}
				}
			}
		}
	}

	if num_size_prices["All"] > 0 {
		markups["All"] = float32(markup_totals["All"]) / float32(num_size_prices["All"])
	}
	if num_size_prices["Beers"] > 0 {
		markups["Beers"] = float32(markup_totals["Beers"]) / float32(num_size_prices["Beers"])
	}
	if num_size_prices["Ciders"] > 0 {
		markups["Ciders"] = float32(markup_totals["Ciders"]) / float32(num_size_prices["Ciders"])
	}
	if num_size_prices["Wines"] > 0 {
		markups["Wines"] = float32(markup_totals["Wines"]) / float32(num_size_prices["Wines"])
	}
	if num_size_prices["Liquors"] > 0 {
		markups["Liquors"] = float32(markup_totals["Liquors"]) / float32(num_size_prices["Liquors"])
	}
	if num_size_prices["NonAlcoholics"] > 0 {
		markups["NonAlcoholics"] = float32(markup_totals["NonAlcoholics"]) / float32(num_size_prices["NonAlcoholics"])
	}
	return markups, err
}

func markupAPIHandler(w http.ResponseWriter, r *http.Request) {

	privilege := checkUserPrivilege()

	switch r.Method {

	case "GET":
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		user_id := r.URL.Query().Get("user_id")
		var restaurant_id string

		err := db.QueryRow(`
      SELECT restaurant_id 
      FROM restaurant_users WHERE user_id=$1;`, user_id).Scan(&restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		brows, err := db.Query(`
      SELECT id, product, sale_status,  alcohol_type, 
      purchase_cost, purchase_count, purchase_volume, purchase_unit 
      FROM beverages 
      WHERE restaurant_id=$1 AND current=true;`, restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var current_bevs []Beverage
		defer brows.Close()
		for brows.Next() {
			var bev Beverage
			if err := brows.Scan(
				&bev.ID,
				&bev.Product,
				&bev.SaleStatus,
				&bev.AlcoholType,
				&bev.PurchaseCost,
				&bev.PurchaseCount,
				&bev.PurchaseVolume,
				&bev.PurchaseUnit); err != nil {
				log.Println(err.Error())
				continue
			}

			current_bevs = append(current_bevs, bev)
		}

		markups, _ := calcMarkupsFromBeverages(current_bevs)

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&markups)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)
	}
}
