package main

import (
	"bytes"
	//"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"math"
	//"net"
	"net/http"
	//"net/mail"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	//"github.com/lib/pq"
	"github.com/jung-kurt/gofpdf"
	"github.com/tealeg/xlsx"
)

type InvSumHistory struct {
	Inventory NullFloat64 `json:"inventory"`
	Wholesale NullFloat64 `json:"wholesale"`
	Deposit   NullFloat64 `json:"deposit"`
	Quantity  float32     `json:"quantity"`
	Date      time.Time   `json:"update"`
}

type InvDateItemHistory struct {
	Date      time.Time     `json:"update"`
	Histories []BeverageInv `json:"histories"`
}

type InvItemSumHistory struct {
	Product   NullString      `json:"product"`
	Brewery   NullString      `json:"brewery"`
	Histories []InvSumHistory `json:"histories"`
}

type InvLocSumHistory struct {
	Location  NullString      `json:"location"`
	Histories []InvSumHistory `json:"histories"`
}

type ExportFile struct {
	URL string `json:"url"`
}

type ActiveMenuCount struct {
	Count int `json:"count"`
}

type BeverageInvs []BeverageInv

// ===================================================
// itemized location inventory (also used for type inventory)
type InvLocSumsByDate struct {
	Date         time.Time           `json:"update"`
	LocHistories []InvLocItemHistory `json:"loc_histories"`
}

type InvLocItemHistory struct {
	Location  NullString    `json:"location"`
	Histories []BeverageInv `json:"histories"`
}

func (slice BeverageInvs) Len() int {
	return len(slice)
}

func (slice BeverageInvs) Less(i, j int) bool {
	return slice[i].Product < slice[j].Product
}

func (slice BeverageInvs) Swap(i, j int) {
	slice[i], slice[j] = slice[j], slice[i]
}

// ===================================================
// sorting by time.Time
type timeArr []time.Time

func (t timeArr) Len() int {
	return len(t)
}

func (t timeArr) Less(i, j int) bool {
	// will sort descending
	return t[i].After(t[j])
}

func (t timeArr) Swap(i, j int) {
	t[i], t[j] = t[j], t[i]
}

func setupInvHandlers() {
	invHandler := http.FileServer(http.Dir("inventory"))
	http.Handle("/inventory/", http.StripPrefix("/inventory/", sessionHandlerDecorator(invHandler)))

	http.HandleFunc("/inv", sessionDecorator(invAPIHandler, g_basic_privilege))
	http.HandleFunc("/loc", sessionDecorator(locAPIHandler, g_basic_privilege))
	http.HandleFunc("/inv/loc", sessionDecorator(invLocAPIHandler, g_basic_privilege))
	http.HandleFunc("/inv/history", sessionDecorator(invHistoryAPIHandler, g_basic_privilege))
	http.HandleFunc("/inv/countsheets", sessionDecorator(invCountSheetsAPIHandler, g_basic_privilege))
	http.HandleFunc("/export/", exportAPIHandler)
}

func invCountSheetsAPIHandler(w http.ResponseWriter, r *http.Request) {

	_, restaurant_id, err := sessionGetUserAndRestaurant(w, r)
	if err != nil {
		return
	}

	switch r.Method {
	case "GET":
		loc_ids := r.URL.Query().Get("loc_ids")

		locs := strings.Split(loc_ids, ",")

		locMap := make(map[Location][]LocBeverageApp)

		// collect the beverages / kegs per Location:
		//     product
		//     brewery
		//     container & volume
		//
		for _, loc_id := range locs {

			// Verify Location exists or quit
			var exists bool
			err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM locations WHERE restaurant_id=$1 AND id=$2);", restaurant_id, loc_id).Scan(&exists)
			if err != nil {
				// if query failed will exit here, so loc_id is guaranteed below
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			if !exists {
				log.Println("Location ID does not exist for restaurant")
				continue
			}

			var last_update time.Time
			err = db.QueryRow("SELECT last_update FROM locations WHERE id=$1;", loc_id).Scan(&last_update)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				return
			}

			var loc Location
			err = db.QueryRow("SELECT name FROM locations WHERE id=$1;", loc_id).Scan(&loc.Name)
			loc.ID, _ = strconv.Atoi(loc_id)

			var locBevs []LocBeverageApp

			// =========================================================================
			// Select BEVERAGES from location
			rows, err := db.Query("SELECT beverages.id, beverages.version_id, beverages.product, beverages.container_type, beverages.brewery, beverages.alcohol_type, beverages.purchase_volume, beverages.purchase_unit, location_beverages.update FROM beverages INNER JOIN location_beverages ON (beverages.id=location_beverages.beverage_id) WHERE location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active AND location_beverages.type='bev' ORDER BY beverages.product ASC;", loc_id, last_update)
			//rows, err := db.Query("SELECT beverages.id, beverages.version_id, beverages.product, beverages.container_type, beverages.brewery, distributors.name, beverages.alcohol_type, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, beverages.deposit, location_beverages.quantity, location_beverages.inventory, location_beverages.update FROM beverages, location_beverages, distributors WHERE beverages.id=location_beverages.beverage_id AND location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active LEFT OUTER JOIN distributors ON (beverages.distributor_id=distributors.id) ORDER BY beverages.product ASC;", loc_id, last_update)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var locBev LocBeverageApp
				locBev.Type = "bev"
				if err := rows.Scan(&locBev.ID, &locBev.VersionID, &locBev.Product, &locBev.ContainerType, &locBev.Brewery, &locBev.AlcoholType, &locBev.PurchaseVolume, &locBev.PurchaseUnit, &locBev.Update); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				locBevs = append(locBevs, locBev)
			}

			// =========================================================================
			// Select KEGS from location
			rows, err = db.Query("SELECT kegs.id, kegs.version_id, distributors.name, kegs.volume, kegs.unit, location_beverages.update FROM kegs INNER JOIN location_beverages ON (kegs.id=location_beverages.beverage_id) INNER JOIN distributors ON (kegs.distributor_id=distributors.id) WHERE location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active AND location_beverages.type='keg' ORDER BY distributors.name ASC;", loc_id, last_update)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var locBev LocBeverageApp
				locBev.Type = "keg"
				if err := rows.Scan(&locBev.ID, &locBev.VersionID, &locBev.Distributor, &locBev.PurchaseVolume, &locBev.PurchaseUnit, &locBev.Update); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				locBevs = append(locBevs, locBev)
			}

			locMap[loc] = locBevs
		}

		log.Println(locMap)
		createCountSheetsPDFFile(restaurant_id, locMap, w, r)
	}
}

// sorting bevs for count sheet by brewery
type ByBrewery []LocBeverageApp

func (a ByBrewery) Len() int      { return len(a) }
func (a ByBrewery) Swap(i, j int) { a[i], a[j] = a[j], a[i] }
func (a ByBrewery) Less(i, j int) bool {

	// Keg is sorted after Bevs
	// Invalid brewery is less than valid brewery
	// If breweries same, sort by product
	// Sort by brewery

	i_type := a[i].Type
	j_type := a[j].Type
	i_product := strings.ToLower(a[i].Product)
	j_product := strings.ToLower(a[j].Product)

	if i_type == "keg" && j_type == "bev" {
		return false
	}
	if i_type == "bev" && j_type == "keg" {
		return true
	}
	if i_type == "keg" && j_type == "keg" {
		if a[i].Distributor.Valid && !a[j].Distributor.Valid {
			return true
		}
		if !a[i].Distributor.Valid && a[j].Distributor.Valid {
			return false
		}
		if !a[i].Distributor.Valid && !a[j].Distributor.Valid {
			return i_product < j_product
		}
		return strings.ToLower(a[i].Distributor.String) < strings.ToLower(a[j].Distributor.String)
	}

	i_brewery := a[i].Brewery
	j_brewery := a[j].Brewery

	if i_brewery.Valid && !j_brewery.Valid {
		return true
	}
	if !i_brewery.Valid && j_brewery.Valid {
		return false
	}
	if !i_brewery.Valid && !j_brewery.Valid {
		return i_product < j_product
	}
	if i_brewery == j_brewery {
		return i_product < j_product
	}
	return strings.ToLower(i_brewery.String) < strings.ToLower(j_brewery.String)
}

func createCountSheetsPDFFile(restaurant_id string, locMap map[Location][]LocBeverageApp, w http.ResponseWriter, r *http.Request) {
	export_dir := "./export/"
	if os.MkdirAll(export_dir, 0755) != nil {
		http.Error(w, "Unable to find or create export directory!", http.StatusInternalServerError)
		return
	}

	var restaurant Restaurant
	err := db.QueryRow("SELECT name FROM restaurants WHERE id=$1;", restaurant_id).Scan(&restaurant.Name)
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// create a hash from restaurant id as the filename extension
	h := fnv.New32a()
	h.Write([]byte(restaurant_id))
	hash := strconv.FormatUint(uint64(h.Sum32()), 10)
	filename := export_dir + "countsheet_" + hash
	filename = strings.Replace(filename, " ", "_", -1)

	var pdf *gofpdf.Fpdf
	pdf = gofpdf.New("P", "mm", "A4", "")
	pdf.SetTitle("Count Sheet", false)

	// Iterate through the DistributorOrders, adding a page for each
	for loc, locBevs := range locMap {

		log.Println(locBevs)

		pdf.AddPage()

		// useful functions:
		// Ln(h float64)
		//     Linebreak
		// MultiCell
		// func (f *Fpdf) GetPageSize() (width, height float64)
		// func (f *Fpdf) GetMargins() (left, top, right, bottom float64)
		// func (f *Fpdf) Cell(w, h float64, txtStr string)
		// func (f *Fpdf) CellFormat(w, h float64, txtStr string, borderStr string, ln int, alignStr string, fill bool, link int, linkStr string)

		//page_width, page_height := pdf.GetPageSize()
		page_width, _ := pdf.GetPageSize()
		//margin_left, margin_top, margin_right, margin_bottom := pdf.GetMargins()
		margin_left, _, margin_right, _ := pdf.GetMargins()
		content_width := page_width - margin_left - margin_right

		// ------------------------------- Header ----------------------------------

		pdf.SetFont("helvetica", "", 12)
		pdf.SetTextColor(120, 120, 120)
		wd := pdf.GetStringWidth(restaurant.Name.String) + margin_right
		pdf.SetX(-wd)
		pdf.Cell(0, 6, restaurant.Name.String)

		pdf.Ln(6)

		pdf.SetFont("helvetica", "B", 16)

		pdf.SetX(margin_left)
		pdf.Cell(0, 6, loc.Name.String)

		tz_str, _ := getRestaurantTimeZone(restaurant_id)
		date_tz := getTimeAtTimezone(time.Now(), tz_str, true)

		pdf.SetFont("helvetica", "", 11)
		time_str := date_tz.Format("Mon Jan 2, 2006 3:04PM")
		wd = pdf.GetStringWidth(time_str) + margin_right
		pdf.SetX(-wd)
		pdf.Cell(0, 6, time_str)

		pdf.Ln(9)
		pdf.SetDrawColor(160, 160, 160)
		pdf.SetTextColor(120, 120, 120)
		pdf.SetFillColor(240, 240, 240)
		pdf.CellFormat(content_width*5/16, 9, " Brewery", "1", 0, "", true, 0, "")
		pdf.CellFormat(content_width/2, 9, " Product", "1", 0, "", true, 0, "")
		pdf.CellFormat(content_width*3/16, 9, " Count", "1", 0, "", true, 0, "")

		min_rows := 25 // have at least this number of rows on a sheet
		bev_rows := 0
		min_extra_rows := 10 // have at least this many empty rows for user to record extra items not on list

		pdf.SetFillColor(255, 255, 255)

		pdf.SetFont("helvetica", "", 10)
		sort.Sort(ByBrewery(locBevs))
		for _, bev := range locBevs {
			pdf.Ln(9)
			product := ""
			brewery := ""
			if bev.Type == "bev" {
				product = bev.Product + "    ( "
				brewery = bev.Brewery.String
				if bev.PurchaseVolume.Valid {
					product += fmt.Sprintf("%.1f", bev.PurchaseVolume.Float64) + " "
				}
				if bev.PurchaseUnit.Valid {
					product += bev.PurchaseUnit.String + " "
				}
				product += bev.ContainerType + " )"

				pdf.SetTextColor(30, 30, 30)
			} else {
				product = "Keg Deposit " + "    ( " + fmt.Sprintf("%.1f", bev.PurchaseVolume.Float64) + " " + bev.PurchaseUnit.String + " )"
				brewery = bev.Distributor.String

				pdf.SetTextColor(150, 150, 150)
			}
			pdf.CellFormat(content_width*5/16, 9, " "+brewery, "1", 0, "", false, 0, "")
			pdf.CellFormat(content_width/2, 9, " "+product, "1", 0, "", false, 0, "")
			pdf.CellFormat(content_width*3/16, 9, "", "1", 0, "", false, 0, "")
			bev_rows += 1
		}

		sub_min_rows := min_rows - bev_rows
		if sub_min_rows < 0 {
			sub_min_rows = min_extra_rows
		} else {
			if sub_min_rows < min_extra_rows {
				sub_min_rows = min_extra_rows
			}
		}

		for i := 0; i < sub_min_rows; i++ {
			pdf.Ln(9)
			pdf.CellFormat(content_width*5/16, 9, "", "1", 0, "", false, 0, "")
			pdf.CellFormat(content_width/2, 9, "", "1", 0, "", false, 0, "")
			pdf.CellFormat(content_width*3/16, 9, "", "1", 0, "", false, 0, "")
		}

	}

	filename += ".pdf"
	err = pdf.OutputFileAndClose(filename)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// if not do_send, it's for review
	w.Header().Set("Content-Type", "application/json")
	var retfile ExportFile
	retfile.URL = filename[1:] // remove the . at the beginning
	js, err := json.Marshal(retfile)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Write(js)

}

func invAPIHandler(w http.ResponseWriter, r *http.Request) {

	_, restaurant_id, err := sessionGetUserAndRestaurant(w, r)
	if err != nil {
		return
	}

	switch r.Method {
	case "GET":

		log.Println(r)

		// when getting sales status, we always want to first set any seasonal
		// bevs whose sale_end period has ended to inactive
		go inactivateExpiredSeasonals(w, restaurant_id)

		get_type := r.URL.Query().Get("type")
		// if type is "names", only return the names, ids, and container types
		names_only := get_type == "names"
		container_type := r.URL.Query().Get("container_type")
		bev_id := r.URL.Query().Get("id")

		var beverages []Beverage
		var beverages_light []BeverageLight

		query := "SELECT id, version_id, container_type, serve_type, distributor_id, keg_id, product, brewery, alcohol_type, abv, purchase_volume, purchase_unit, purchase_cost, purchase_count, flavor_profile, sale_status, sale_start, sale_end, par FROM beverages WHERE restaurant_id=" + restaurant_id + " AND current"
		if names_only {
			query = "SELECT id, version_id, container_type, product FROM beverages WHERE restaurant_id=" + restaurant_id + " AND current"
		}
		// this is a hackery to prevent injection attacks
		if len(container_type) != 0 && len(container_type) < 8 {
			query += " AND container_type='" + container_type + "'"
		}
		if len(bev_id) != 0 {
			if _, err := strconv.Atoi(bev_id); err == nil {
				query += " AND id=" + bev_id
			}
		}

		query += " ORDER BY product;"

		//log.Println(query)
		rows, err := db.Query(query)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		defer rows.Close()
		for rows.Next() {
			var bev_light BeverageLight
			var bev Beverage
			if names_only {
				if err := rows.Scan(
					&bev_light.ID,
					&bev_light.VersionID,
					&bev_light.ContainerType,
					&bev_light.Product); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
			} else {
				if err := rows.Scan(
					&bev.ID,
					&bev.VersionID,
					&bev.ContainerType,
					&bev.ServeType,
					&bev.DistributorID,
					&bev.KegID,
					&bev.Product,
					&bev.Brewery,
					&bev.AlcoholType,
					&bev.ABV,
					&bev.PurchaseVolume,
					&bev.PurchaseUnit,
					&bev.PurchaseCost,
					&bev.PurchaseCount,
					&bev.FlavorProfile,
					&bev.SaleStatus,
					&bev.SaleStart,
					&bev.SaleEnd,
					&bev.Par); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
			}

			if names_only {
				beverages_light = append(beverages_light, bev_light)
				continue
			}

			// populate Distributor name based on DistributorID, if it exists
			if bev.DistributorID.Valid {
				var distName string
				err := db.QueryRow("SELECT name FROM distributors WHERE id=$1;", bev.DistributorID).Scan(&distName)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
				} else {
					bev.Distributor.String = distName
					bev.Distributor.Valid = true
				}
			}

			// populate Deposit based on KegID, if it exists
			if bev.KegID.Valid {
				var deposit float32
				err := db.QueryRow("SELECT deposit FROM kegs WHERE id=$1;", bev.KegID).Scan(&deposit)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
				} else {
					bev.Deposit.Float64 = float64(deposit)
					bev.Deposit.Valid = true
				}
			}

			// get count and RECENT count of inventory in all bev locations
			count_recent, last_inv_update, _ := getBeverageRecentInventory(bev.VersionID)
			bev.CountRecent = count_recent
			bev.LastInvUpdate = last_inv_update

			// Now get the total count of this beverage.  Note that we want to find
			// all the version_id that match, in case this beverage was updated
			// recently
			err = db.QueryRow("SELECT COALESCE(SUM(location_beverages.quantity), 0) FROM location_beverages, locations WHERE locations.type='bev' AND locations.active AND location_beverages.location_id=locations.id AND location_beverages.update=locations.last_update AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=$1 AND location_beverages.type='bev';", bev.VersionID).Scan(&bev.Count)
			switch {
			case err == sql.ErrNoRows:
				bev.Count = 0
			case err != nil:
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			// get total inventory of beverage
			var total_inv NullFloat64
			// Instead of calculating the inventory, just grab the sum of the most
			// recent location_beverages.inventory values
			err = db.QueryRow("SELECT COALESCE(SUM(COALESCE(location_beverages.inventory,0)),0) FROM location_beverages, beverages, locations WHERE beverages.version_id=$1 AND beverages.id=location_beverages.beverage_id AND location_beverages.active AND location_beverages.location_id=locations.id AND locations.active AND location_beverages.update=locations.last_update AND location_beverages.type='bev';", bev.VersionID).Scan(&total_inv)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				continue
			}
			bev.Inventory = total_inv

			beverages = append(beverages, bev)
		}

		if !names_only {
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
		}

		w.Header().Set("Content-Type", "application/json")

		if names_only {
			js, err := json.Marshal(beverages_light)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)
		} else {
			js, err := json.Marshal(beverages)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)
		}

	case "POST":

		// When posting, generate the beverages.id serial automatically, then
		// copy it over to beverages.version_id, which relates historical records
		// of the same beverage to each other.  Also, set start_date to the
		// current time, and set current to TRUE

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
		cur_time := time.Now().UTC()
		var bev_id int
		err = db.QueryRow(`
			INSERT INTO beverages(
				product, container_type, serve_type, distributor_id, keg_id, brewery, 
				alcohol_type, abv, purchase_volume, purchase_unit, purchase_cost, 
				purchase_count, flavor_profile, restaurant_id, start_date, current, 
				sale_status, sale_start, sale_end, par) 
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 
				$15, TRUE, $16, $17, $18, $19) RETURNING id;`,
			bev.Product, bev.ContainerType, bev.ServeType, bev.DistributorID,
			bev.KegID, bev.Brewery, bev.AlcoholType, bev.ABV, bev.PurchaseVolume,
			bev.PurchaseUnit, bev.PurchaseCost, bev.PurchaseCount, bev.FlavorProfile,
			restaurant_id, cur_time, bev.SaleStatus, bev.SaleStart, bev.SaleEnd,
			bev.Par).Scan(&bev_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// copy bev id to version_id, which relates historical changes of this
		// beverage to each other.
		_, err = db.Exec("UPDATE beverages SET version_id=$1 WHERE id=$2;", bev_id, bev_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		bev.ID = bev_id
		bev.VersionID = bev_id
		bev.Count = 0
		var validSalePrices []SalePrice // collect only valid sale price entries

		// For each of the SalePrice items, insert entry into size_prices
		for i := range bev.SalePrices {
			salePrice := bev.SalePrices[i]
			// if both Volume and Price are empty, don't add an entry -- it means the
			// user left this blank
			if !salePrice.Volume.Valid && !salePrice.Price.Valid {
				// remove bev.SalePrices[i]
				continue
			}
			_, err = db.Exec("INSERT INTO size_prices(serving_size, serving_unit, serving_price, beverage_id) VALUES($1, $2, $3, $4);", salePrice.Volume, salePrice.Unit, salePrice.Price, bev_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			validSalePrices = append(validSalePrices, salePrice)
		}

		bev.SalePrices = validSalePrices

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		js, err := json.Marshal(&bev)
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

		// first verify this beverage belongs to the user
		var exists bool
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM beverages WHERE restaurant_id=$1 AND id=$2);", restaurant_id, bev_update.Bev.ID).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !exists {
			http.Error(w, "The beverage does not belong to the user!", http.StatusInternalServerError)
			return
		}

		// Here's how we update the keys:
		// Any "special" keys not in the beverage table we handle individually
		// Any keys in the beverage table should match the table's keys so
		// we can just insert them
		//
		// First, handle the "special" keys
		// - size_prices requires updating a separate table, so it is its own special key
		// - sale_status, sale_start, sale_end, and par are not long term state variables,
		//   so we do not need to increment the beverage id when these change
		// - everything else requires an increment to beverage id
		var sizePricesChanged bool
		var beverageChanged bool
		var saleStatusChanged bool
		var saleStatusUpdateKeys []string
		var beverageUpdateKeys []string
		for _, key := range bev_update.ChangeKeys {
			if key == "size_prices" {
				sizePricesChanged = true
			} else if key == "sale_status" || key == "sale_start" || key == "sale_end" || key == "par" {
				saleStatusChanged = true
				saleStatusUpdateKeys = append(saleStatusUpdateKeys, key)
			} else {
				beverageChanged = true
				beverageUpdateKeys = append(beverageUpdateKeys, key)
			}
		}

		var old_bev_id int
		err = db.QueryRow("SELECT id FROM beverages WHERE current=TRUE AND version_id=(SELECT version_id FROM beverages WHERE id=$1);", bev_update.Bev.ID).Scan(&old_bev_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		doDuplicate := sizePricesChanged || beverageChanged

		var new_bev_id int
		// Only need to duplicate the beverage into new entry with new id if
		// sizePrices changed or beverageChanged, NOT if only saleStatusChanged.
		if doDuplicate {

			// duplicate old beverage into new entry with new id, this will be the
			// updated entry we update with the new changes we received from user
			// if sizePricesChanged we don't duplicate size_prices, we'll insert
			// it manually after duplicating.
			new_bev_id, err = updateBeverageVersion(old_bev_id, !sizePricesChanged)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			new_bev_id = old_bev_id
		}

		if beverageChanged {
			log.Println("Do beverage")

			for _, key := range beverageUpdateKeys {
				if key == "product" {
					_, err = db.Exec("UPDATE beverages SET product=$1 WHERE id=$2", bev_update.Bev.Product, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "container_type" {
					_, err = db.Exec("UPDATE beverages SET container_type=$1 WHERE id=$2", bev_update.Bev.ContainerType, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "serve_type" {
					_, err = db.Exec("UPDATE beverages SET serve_type=$1 WHERE id=$2", bev_update.Bev.ServeType, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "distributor_id" {
					_, err = db.Exec("UPDATE beverages SET distributor_id=$1 WHERE id=$2", bev_update.Bev.DistributorID, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "keg_id" {
					_, err = db.Exec("UPDATE beverages SET keg_id=$1 WHERE id=$2", bev_update.Bev.KegID, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "brewery" {
					_, err = db.Exec("UPDATE beverages SET brewery=$1 WHERE id=$2", bev_update.Bev.Brewery, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "alcohol_type" {
					_, err = db.Exec("UPDATE beverages SET alcohol_type=$1 WHERE id=$2", bev_update.Bev.AlcoholType, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}

					// if bev is now non-alcoholic, sets its abv to 0
					if bev_update.Bev.AlcoholType == "Non Alcoholic" {
						_, err = db.Exec("UPDATE beverages SET abv=NULL WHERE id=$1", new_bev_id)
						if err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							continue
						}
					}

				} else if key == "abv" {
					_, err = db.Exec("UPDATE beverages SET abv=$1 WHERE id=$2", bev_update.Bev.ABV, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "purchase_volume" {
					_, err = db.Exec("UPDATE beverages SET purchase_volume=$1 WHERE id=$2", bev_update.Bev.PurchaseVolume, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "purchase_unit" {
					_, err = db.Exec("UPDATE beverages SET purchase_unit=$1 WHERE id=$2", bev_update.Bev.PurchaseUnit, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "purchase_cost" {
					_, err = db.Exec("UPDATE beverages SET purchase_cost=$1 WHERE id=$2", bev_update.Bev.PurchaseCost, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "purchase_count" {
					_, err = db.Exec("UPDATE beverages SET purchase_count=$1 WHERE id=$2", bev_update.Bev.PurchaseCount, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "flavor_profile" {
					_, err = db.Exec("UPDATE flavor_profile SET serve_type=$1 WHERE id=$2", bev_update.Bev.FlavorProfile, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				}
			}
		}

		// XXX New SalePrices procedure:
		// if sizePricesChanged, insert new entries from bev_update.Bev.SalePrices
		// into table size_prices, with the new copied beverage_id
		// if not sizePricesChanged, copy all old entries from size_prices with the
		// old beverage_id into new entries with the new beverage_id
		if sizePricesChanged {
			sps := bev_update.Bev.SalePrices
			log.Println("Do sale prices ")

			// Now insert fresh entries for the sale prices
			for _, sp := range sps {
				// if both Volume and Price are empty, don't add an entry -- it means the
				// user left this blank
				if !sp.Volume.Valid && !sp.Price.Valid {
					// remove bev.SalePrices[i]
					continue
				}
				_, err = db.Exec("INSERT INTO size_prices(serving_size, serving_unit, serving_price, beverage_id) VALUES ($1, $2, $3, $4);", sp.Volume, sp.Unit, sp.Price, new_bev_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
			}

			// if the previous version had the same size_price vol + unit as this
			// one, duplicate the clover_join entry corresponding to that
			// size_price, if one is available, and change its size_prices id
			// to the new id, and beverage_id to the new beverage_id as well.
			// also duplicate the clover_join entries to point to new size_prices
			_, err = db.Exec(`
					WITH old_clover_join AS (
						SELECT clover_join.restaurant_id, clover_join.pos_item_id,
						  clover_join.version_id, clover_join.beverage_id, clover_join.size_prices_id, 
						  size_prices.serving_size, size_prices.serving_unit 
						  FROM clover_join 
						  INNER JOIN size_prices ON (clover_join.size_prices_id=size_prices.id)
						  WHERE clover_join.beverage_id=$3
						) 
					INSERT INTO clover_join (
						restaurant_id, pos_item_id, version_id, beverage_id, size_prices_id) 
					SELECT $1, old_clover_join.pos_item_id, old_clover_join.version_id, $2, size_prices.id 
					FROM size_prices, old_clover_join 
					WHERE size_prices.beverage_id=$2 
					AND size_prices.serving_size=old_clover_join.serving_size 
					AND size_prices.serving_unit=old_clover_join.serving_unit;
					`, restaurant_id, new_bev_id, old_bev_id)
		}

		// Finally, handle sale status changes
		if saleStatusChanged {
			for _, key := range saleStatusUpdateKeys {
				if key == "sale_status" {
					_, err = db.Exec("UPDATE beverages SET sale_status=$1 WHERE id=$2", bev_update.Bev.SaleStatus, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "sale_start" {
					_, err = db.Exec("UPDATE beverages SET sale_start=$1 WHERE id=$2", bev_update.Bev.SaleStart, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "sale_end" {
					_, err = db.Exec("UPDATE beverages SET sale_end=$1 WHERE id=$2", bev_update.Bev.SaleEnd, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				} else if key == "par" {
					_, err = db.Exec("UPDATE beverages SET par=$1 WHERE id=$2", bev_update.Bev.Par, new_bev_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
				}
			}
			createRestaurantMenuPage(restaurant_id, w, false)
		}

		w.Header().Set("Content-Type", "application/json")
		var bev BeverageLight
		bev.ID = new_bev_id
		js, err := json.Marshal(&bev)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "DELETE":
		// XXX verify user is authorized

		bev_id := r.URL.Query().Get("id")

		// check version_id of bev_id
		// go through all beverages.id which match version_id
		// check location_beverages and tap_beverages to see if any are referenced as beverage_id
		// if so, just set bev_id current to FALSE and end_date as cur_time
		// otherwise, delete the beverage entirely:
		//   delete any entries in size_prices
		//   delete all beverages with version_id

		var version_id int
		err := db.QueryRow("SELECT version_id FROM beverages WHERE restaurant_id=$1 AND id=$2;", restaurant_id, bev_id).Scan(&version_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		has_history := false
		rows, err := db.Query("SELECT id FROM beverages WHERE version_id=$1;", version_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var old_ids []int
		defer rows.Close()
		for rows.Next() {
			var old_id int
			if err := rows.Scan(
				&old_id); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			old_ids = append(old_ids, old_id)
		}
		for i := range old_ids {
			old_id := old_ids[i]
			check_tables := []string{"location_beverages", "tap_beverages", "distributor_order_items", "do_item_deliveries" /*"delivery_items",*/}
			for t_i := range check_tables {
				table_name := check_tables[t_i]
				if table_name == "location_beverages" {
					// need to chech type is 'bev' instead of 'keg' when deleting a beverage
					err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM location_beverages WHERE beverage_id=$1 AND type='bev');", old_id).Scan(&has_history)
				} else {
					err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM "+table_name+" WHERE beverage_id=$1);", old_id).Scan(&has_history)
				}

				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				if has_history == true {
					break
				}
			}
			if has_history == true {
				break
			}
		}
		// if has_history, set bev_id's current to false, and end_date to cur_time
		// else, delete any entries in size_prices and delete all beverages which
		// match any of the old_ids
		if has_history == true {
			cur_time := time.Now().UTC()
			_, err := db.Exec("UPDATE beverages SET current=FALSE, end_date=$1 WHERE version_id=$2 AND CURRENT=TRUE;", cur_time, version_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			for i := range old_ids {
				old_id := old_ids[i]
				_, err := db.Exec("DELETE FROM size_prices WHERE beverage_id=$1;", old_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				_, err = db.Exec("DELETE FROM beverages WHERE id=$1;", old_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}
		}

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
}

func locAPIHandler(w http.ResponseWriter, r *http.Request) {

	_, restaurant_id, err := sessionGetUserAndRestaurant(w, r)
	if err != nil {
		return
	}

	switch r.Method {
	case "GET":

		loc_type := r.URL.Query().Get("type")

		var locations []Location

		rows, err := db.Query(`
			SELECT id, name, last_update FROM locations 
			WHERE restaurant_id=$1 AND type=$2 AND active ORDER BY id;`, restaurant_id, loc_type)
		if err != nil {
			log.Fatal(err)
		}
		defer rows.Close()
		for rows.Next() {
			var loc Location
			if err := rows.Scan(&loc.ID, &loc.Name, &loc.LastUpdate); err != nil {
				log.Fatal(err)
			}

			// XXX Get the count of all inventory items and empty kegs in this loc
			// since the last_update
			// 1. First check if last_update is null.  If it is there's nothing to do.
			// 2. Get count of bevs from last update
			// 3. Get count of kegs from last update
			//err = db.QueryRow("SELECT beverages.id, beverages.version_id, beverages.product, beverages.container_type, beverages.brewery, distributors.name, beverages.alcohol_type, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, kegs.deposit, location_beverages.quantity, location_beverages.inventory, location_beverages.update FROM beverages INNER JOIN location_beverages ON (beverages.id=location_beverages.beverage_id) LEFT OUTER JOIN distributors ON (beverages.distributor_id=distributors.id) LEFT OUTER JOIN kegs ON (beverages.keg_id=kegs.id) WHERE location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active AND location_beverages.type='bev' ORDER BY beverages.product ASC;", loc_id, last_update)
			err = db.QueryRow("SELECT COUNT(DISTINCT beverages.id) FROM beverages INNER JOIN location_beverages ON (beverages.id=location_beverages.beverage_id) WHERE location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active AND location_beverages.type='bev';", loc.ID, loc.LastUpdate).Scan(&loc.LastBevCount)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			//err = db.QueryRow("SELECT kegs.id, kegs.version_id, distributors.name, kegs.volume, kegs.unit, kegs.deposit, location_beverages.quantity, location_beverages.inventory, location_beverages.update FROM kegs INNER JOIN location_beverages ON (kegs.id=location_beverages.beverage_id) INNER JOIN distributors ON (kegs.distributor_id=distributors.id) WHERE location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active AND location_beverages.type='keg' ORDER BY distributors.name ASC;", loc_id, last_update)
			err = db.QueryRow("SELECT COUNT(DISTINCT kegs.id) FROM kegs INNER JOIN location_beverages ON (kegs.id=location_beverages.beverage_id) WHERE location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active AND location_beverages.type='keg';", loc.ID, loc.LastUpdate).Scan(&loc.LastKegCount)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
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

		_, err = db.Exec(`
			INSERT INTO locations(name, last_update, restaurant_id, type, active) 
			VALUES ($1, $2, $3, $4, TRUE);`, newLoc.Name, time.Time{}, restaurant_id, newLoc.Type)
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
		err = db.QueryRow(`
			SELECT id FROM locations WHERE restaurant_id=$1 AND name=$2 AND type=$3;`,
			restaurant_id, rename.Name, rename.Type).Scan(&loc_id)
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
		loc_type := r.URL.Query().Get("type")

		// Verify Location exists or quit
		var loc_id int
		err := db.QueryRow(`SELECT id FROM locations WHERE restaurant_id=$1 AND name=$2 AND type=$3;`,
			restaurant_id, loc_name, loc_type).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		has_history := false
		check_tables := map[string]string{
			"location_beverages": "location_id",
			"tap_beverages":      "tap_id",
			"taps_last_update":   "tap_id",
		}
		for table, column := range check_tables {
			err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM "+table+" WHERE "+column+"=$1);", loc_id).Scan(&has_history)
			if err != nil {
				// if query failed will exit here, so loc_id is guaranteed below
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if has_history == true {
				break
			}
		}

		// if there is history, simply set the locations.active to false
		if has_history {
			_, err = db.Exec("UPDATE locations SET active=FALSE WHERE id=$1;", loc_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			// If there isn't history, straight up delete location entry
			_, err = db.Exec("DELETE FROM locations WHERE id=$1;", loc_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

		}

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return

	}
}

// responsible for serving exported downloadable files (such as spreadsheets)
// to user.  Expects r.URL to contain the filename, e.g., /export/myfile.txt
func exportAPIHandler(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Path[len("/export/"):]
	http.ServeFile(w, r, "export/"+filename)
}

// responsible for serving online menu pages
// Expects r.URL to contain the filename, e.g., /export/myfile.txt
func menuPagesAPIHandler(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Path[len("/menu_pages/"):]
	http.ServeFile(w, r, "menu_pages/"+filename)
}

func createXlsxFile(data []byte, sorted_keys []string, history_type string, suffix string, restaurant_id string, w http.ResponseWriter, r *http.Request, email string, start_date string, end_date string, tz_str string) {

	export_dir := "./export/"
	if os.MkdirAll(export_dir, 0755) != nil {
		http.Error(w, "Unable to find or create export directory!", http.StatusInternalServerError)
		return
	}

	// create a hash from user id as the filename extension
	h := fnv.New32a()
	h.Write([]byte(restaurant_id))
	hash := strconv.FormatUint(uint64(h.Sum32()), 10)
	filename := export_dir + "history_" + suffix + hash + ".xlsx"
	filename = strings.Replace(filename, " ", "_", -1)

	xfile := xlsx.NewFile()
	sheet, _ := xfile.AddSheet("Sheet1")
	// create headers
	row := sheet.AddRow()
	cell := row.AddCell()
	cell = row.AddCell()
	cell.Value = "Product"
	cell = row.AddCell()
	cell.Value = "Brewery"
	cell = row.AddCell()
	cell.Value = "Quantity"
	cell = row.AddCell()
	cell.Value = "Wholesale ($)"
	cell = row.AddCell()
	cell.Value = "Deposit ($)"
	cell = row.AddCell()
	cell.Value = "Inventory ($)"

	nr := bytes.NewReader(data)
	decoder := json.NewDecoder(nr)

	/* //xlsx style support currently not working, issue tracked on github:
	//https://github.com/tealeg/xlsx/issues/84
	boldFont := xlsx.DefaulFont()
	boldFont.Bold = true
	boldStyle := xlsx.NewStyle()
	boldStyle.Font = *boldFont
	*/

	switch history_type {
	case "all_itemized":
		var itemsByDate []InvDateItemHistory
		err := decoder.Decode(&itemsByDate)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		//log.Println(sorted_keys)

		for _, key := range sorted_keys {
			// each key is a date
			daterow := sheet.AddRow()
			cell = daterow.AddCell()
			//cell.SetStyle(boldStyle)
			key_date := strings.Split(key, " ")[0]
			cell.Value = key_date // the date, e.g., 2015-01-01
			daterow.AddCell()
			daterow.AddCell()
			daterow.AddCell()
			daterow.AddCell()
			daterow.AddCell()
			date_sum_cell := daterow.AddCell()

			var dateItem InvDateItemHistory
			for _, item := range itemsByDate {
				item_date := strings.Split(item.Date.String(), " ")[0]
				if item_date == key_date {
					dateItem = item
					break
				}
			}
			date_inv_sum := 0.0

			for _, bevInv := range dateItem.Histories {
				bevrow := sheet.AddRow()
				cell = bevrow.AddCell()
				cell = bevrow.AddCell()
				if bevInv.Type.Valid && bevInv.Type.String == "keg" {
					cell.Value = fmt.Sprintf("Keg Deposit - %s %.1f %s", bevInv.Distributor.String, bevInv.Volume.Float64, bevInv.Unit.String)
				} else {
					cell.Value = bevInv.Product
				}
				cell = bevrow.AddCell()
				cell.Value = bevInv.Brewery.String
				cell = bevrow.AddCell()
				cell.Value = fmt.Sprintf("%.2f", bevInv.Quantity)
				cell = bevrow.AddCell()
				cell.Value = fmt.Sprintf("%.2f", bevInv.Wholesale.Float64)
				cell = bevrow.AddCell()
				cell.Value = fmt.Sprintf("%.2f", bevInv.Deposit.Float64)
				cell = bevrow.AddCell()
				cell.Value = fmt.Sprintf("%.2f", bevInv.Inventory.Float64)
				date_inv_sum += bevInv.Inventory.Float64
			}

			date_sum_cell.Value = fmt.Sprintf("%.2f", date_inv_sum)
			sheet.AddRow() // add empty row to separate dates
		}
	case "loc_itemized", "type_itemized":
		var allDateInvs []InvLocSumsByDate
		err := decoder.Decode(&allDateInvs)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		//log.Println(allDateInvs)
		//log.Println(sorted_keys)

		for _, key := range sorted_keys {
			// each key is a date string
			daterow := sheet.AddRow()
			cell = daterow.AddCell()
			//cell.SetStyle(boldStyle)
			key_date := strings.Split(key, " ")[0]
			cell.Value = key_date // the date, e.g., 2015-01-01
			daterow.AddCell()
			daterow.AddCell()
			daterow.AddCell()
			daterow.AddCell()
			daterow.AddCell()
			date_sum_cell := daterow.AddCell()

			var aDateInv InvLocSumsByDate
			for _, ainv := range allDateInvs {
				ainv_date := strings.Split(ainv.Date.String(), " ")[0]
				if ainv_date == key_date {
					aDateInv = ainv
					break
				}
			}
			date_inv_sum := 0.0
			for _, locHistory := range aDateInv.LocHistories {
				locrow := sheet.AddRow()
				cell = locrow.AddCell()
				cell.Value = locHistory.Location.String
				cell = locrow.AddCell()
				cell = locrow.AddCell()
				cell = locrow.AddCell()
				cell = locrow.AddCell()
				cell = locrow.AddCell()
				loc_inv_sum_cell := locrow.AddCell()
				loc_inv_sum := 0.0
				for _, itemHistory := range locHistory.Histories {
					itemrow := sheet.AddRow()
					cell = itemrow.AddCell()
					cell = itemrow.AddCell()
					if itemHistory.Type.Valid && itemHistory.Type.String == "keg" {
						cell.Value = fmt.Sprintf("Keg Deposit - %s %.1f %s", itemHistory.Distributor.String, itemHistory.Volume.Float64, itemHistory.Unit.String)
					} else {
						cell.Value = itemHistory.Product
					}
					cell = itemrow.AddCell()
					cell.Value = itemHistory.Brewery.String
					cell = itemrow.AddCell()
					cell.Value = fmt.Sprintf("%.2f", itemHistory.Quantity)
					cell = itemrow.AddCell()
					cell.Value = fmt.Sprintf("%.2f", itemHistory.Wholesale.Float64)
					cell = itemrow.AddCell()
					cell.Value = fmt.Sprintf("%.2f", itemHistory.Deposit.Float64)
					cell = itemrow.AddCell()
					cell.Value = fmt.Sprintf("%.2f", itemHistory.Inventory.Float64)
					loc_inv_sum += itemHistory.Inventory.Float64
				}
				loc_inv_sum_cell.Value = fmt.Sprintf("%.2f", loc_inv_sum)
				date_inv_sum += loc_inv_sum
			}
			date_sum_cell.Value = fmt.Sprintf("%.2f", date_inv_sum)
			sheet.AddRow() // add empty row to separate dates
		}
	}

	err := xfile.Save(filename)
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if len(email) > 3 {

		log.Println(start_date)
		log.Println(end_date)
		log.Println(tz_str)

		// dates are in this format:
		// 2015-09-05T07:29:33.629Z
		// need to parse into time
		const parseLongForm = "2006-01-02T15:04:05.000Z"
		start_date, _ := time.Parse(parseLongForm, start_date)
		end_date, _ := time.Parse(parseLongForm, end_date)

		// results from time.Parse have timezone, so set @has_timezone=true
		start_date = getTimeAtTimezone(start_date, tz_str, true)
		end_date = getTimeAtTimezone(end_date, tz_str, true)

		log.Println(start_date)
		log.Println(end_date)

		format_layout := "01/02/2006"
		start_date_str := start_date.Format(format_layout)
		end_date_str := end_date.Format(format_layout)

		date_title := start_date_str
		date_content := ""
		if start_date_str != end_date_str {
			date_title += " - " + end_date_str
			date_content = "from " + start_date_str + " to " + end_date_str
		} else {
			date_content = "on " + start_date_str
		}

		title_layout := "01-02-2006"
		start_date_title := start_date.Format(title_layout)
		end_date_title := end_date.Format(title_layout)
		title_date_title := start_date_title
		if start_date_title != end_date_title {
			title_date_title += "_" + end_date_title
		}

		email_title := "Inventory Spreadsheet: " + date_title
		email_body := "Attached is a spreadsheet with your inventory records " + date_content + "."
		file_location := filename
		file_name := "Inventory_" + title_date_title + ".xlsx"

		err = sendAttachmentEmail(email, email_title, email_body, file_location, file_name, "application/xlsx")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	} else {
		w.Header().Set("Content-Type", "application/json")
		var retfile ExportFile
		retfile.URL = filename[1:] // remove the . at the beginning
		js, err := json.Marshal(retfile)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)
	}

}

func invHistoryAPIHandler(w http.ResponseWriter, r *http.Request) {

	_, restaurant_id, err := sessionGetUserAndRestaurant(w, r)
	if err != nil {
		return
	}

	switch r.Method {
	case "GET":
		history_type := r.URL.Query().Get("type")
		start_date := r.URL.Query().Get("start_date")
		end_date := r.URL.Query().Get("end_date")

		tz_str, _ := getRestaurantTimeZone(restaurant_id)

		log.Println("TZ STRING")
		log.Println(tz_str)
		log.Println(start_date)
		log.Println(end_date)
		// if export is set, that means return a save-able file instead of JSON
		export := r.URL.Query().Get("export")
		log.Println(history_type)
		email := r.URL.Query().Get("email")

		// if no dates were provided, set start date to 1 month ago and end date
		// to now
		if len(start_date) == 0 || len(end_date) == 0 {
			start_date = time.Now().UTC().String()
			// 1 month ago
			end_date = time.Now().AddDate(0, -1, 0).UTC().String()
		}

		if history_type == "all_sum" {
			// Because location_beverages only stores one entry per DAY per beverage
			// at each location, summing across all locations on the same day would
			// yield total quantity on that day
			//
			// for each distinct DAY (no hour, min, etc), for each beverage,
			// in all locations, sum quantity * p_cost / p_count

			var histories []InvSumHistory
			/*
				// XXX this is old logic, which is correct, but incurs a lot of calculation
				// The new query uses saved location_beverages.inventory to get inventory
				// a lot faster.
				rows, err := db.Query(
					`SELECT SUM(res.inv), res.update FROM (
					  SELECT CASE WHEN locations.type='kegs' THEN SUM(COALESCE(beverages.deposit,0)*location_beverages.quantity)
					              WHEN locations.type='tap' THEN SUM(
					              	CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume*beverages.purchase_cost/beverages.purchase_count+COALESCE(beverages.deposit,0)
					              	     ELSE COALESCE(beverages.deposit,0)
					              	END)
					              ELSE SUM(beverages.purchase_cost/beverages.purchase_count*location_beverages.quantity+COALESCE(beverages.deposit,0)*location_beverages.quantity)
					         END AS inv, location_beverages.update::date AS update
					         FROM location_beverages, beverages, locations WHERE location_beverages.beverage_id=beverages.id AND locations.id=location_beverages.location_id AND location_beverages.update > (now() - '1 month'::interval) GROUP BY update, locations.type
					) AS res GROUP BY res.update ORDER BY res.update;`)
			*/
			// XXX Not sure need locations.active or location_beverages.active in the query since this is historical view
			rows, err := db.Query(`
				SELECT SUM(COALESCE(location_beverages.inventory,0)), (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date AS local_update 
				FROM location_beverages, locations 
				WHERE location_beverages.update AT TIME ZONE 'UTC' BETWEEN $2 AND $3
					AND locations.id=location_beverages.location_id AND locations.restaurant_id=$4
				GROUP BY local_update ORDER BY local_update;`,
				tz_str, start_date, end_date, restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var history InvSumHistory
				if err := rows.Scan(
					&history.Inventory,
					&history.Date); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}

				histories = append(histories, history)
			}

			w.Header().Set("Content-Type", "application/json")
			js, err := json.Marshal(histories)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)

		} else if history_type == "loc_sum" {

			var histories []InvLocSumHistory

			// First get all locations, but omit taps
			loc_rows, err := db.Query(`
				SELECT DISTINCT locations.id, locations.name 
				FROM location_beverages, locations 
				WHERE locations.restaurant_id=$1 
					AND location_beverages.location_id=locations.id 
					AND locations.type!='tap';`, restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer loc_rows.Close()
			for loc_rows.Next() {
				var loc Location
				if err := loc_rows.Scan(
					&loc.ID,
					&loc.Name); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				var sumHistories []InvSumHistory
				var locSumHistory InvLocSumHistory
				locSumHistory.Location = loc.Name

				rows, err := db.Query(`
					SELECT SUM(COALESCE(location_beverages.inventory,0)), (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date AS local_update 
					FROM locations, location_beverages 
					WHERE locations.id=$2 
						AND location_beverages.location_id=locations.id 
						AND location_beverages.update AT TIME ZONE 'UTC' BETWEEN $3 AND $4 
					GROUP BY local_update ORDER BY local_update;`,
					tz_str, loc.ID, start_date, end_date)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				defer rows.Close()
				for rows.Next() {
					var history InvSumHistory
					if err := rows.Scan(
						&history.Inventory,
						&history.Date); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}

					sumHistories = append(sumHistories, history)
				}
				locSumHistory.Histories = sumHistories
				histories = append(histories, locSumHistory)
			}

			// ------------------------ TAPS --------------------------
			// now treat all taps as a single location
			var sumHistories []InvSumHistory
			var locSumHistory InvLocSumHistory
			locSumHistory.Location.String = "All Taps"
			locSumHistory.Location.Valid = true

			rows, err := db.Query(`
				SELECT SUM(COALESCE(location_beverages.inventory,0)), (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date AS local_update 
				FROM locations, location_beverages 
				WHERE locations.type='tap' AND location_beverages.location_id=locations.id 
					AND location_beverages.update AT TIME ZONE 'UTC' BETWEEN $2 AND $3 
					AND locations.restaurant_id=$4 
				GROUP BY local_update ORDER BY local_update;`,
				tz_str, start_date, end_date, restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var history InvSumHistory
				if err := rows.Scan(
					&history.Inventory,
					&history.Date); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}

				sumHistories = append(sumHistories, history)
			}
			locSumHistory.Histories = sumHistories
			histories = append(histories, locSumHistory)

			w.Header().Set("Content-Type", "application/json")
			js, err := json.Marshal(histories)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)
		} else if history_type == "type_sum" {

			// piggy back off the loc struct, use Location as Type
			var histories []InvLocSumHistory

			// First get all alcohol types
			type_rows, err := db.Query(`
				SELECT DISTINCT beverages.alcohol_type FROM beverages, location_beverages, locations 
				WHERE location_beverages.update AT TIME ZONE 'UTC' BETWEEN $1 AND $2 
					AND locations.id=location_beverages.location_id AND locations.restaurant_id=$3 
					AND beverages.id=location_beverages.beverage_id AND location_beverages.type='bev' 
				ORDER BY beverages.alcohol_type ASC;`,
				start_date, end_date, restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer type_rows.Close()
			for type_rows.Next() {
				var atype string
				if err := type_rows.Scan(
					&atype); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				var sumHistories []InvSumHistory
				var locSumHistory InvLocSumHistory
				locSumHistory.Location.String = atype
				locSumHistory.Location.Valid = true

				rows, err := db.Query(`
					SELECT SUM(COALESCE(location_beverages.inventory,0)), (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date AS local_update 
					FROM beverages, location_beverages 
					WHERE beverages.alcohol_type=$2 
						AND location_beverages.beverage_id=beverages.id 
						AND location_beverages.update AT TIME ZONE 'UTC' BETWEEN $3 AND $4 
						AND location_beverages.type='bev' 
					GROUP BY local_update ORDER BY local_update;`,
					tz_str, atype, start_date, end_date)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				defer rows.Close()
				for rows.Next() {
					var history InvSumHistory
					if err := rows.Scan(
						&history.Inventory,
						&history.Date); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}

					sumHistories = append(sumHistories, history)
				}
				locSumHistory.Histories = sumHistories
				histories = append(histories, locSumHistory)
			}

			// now handle empty kegs
			var sumHistories []InvSumHistory
			var locSumHistory InvLocSumHistory
			locSumHistory.Location.String = "Keg Deposits"
			locSumHistory.Location.Valid = true
			rows, err := db.Query(`
				SELECT SUM(COALESCE(location_beverages.inventory,0)), (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date AS local_update 
				FROM location_beverages 
				WHERE location_beverages.update AT TIME ZONE 'UTC' BETWEEN $2 AND $3 
					AND location_beverages.type='keg' 
				GROUP BY local_update ORDER BY local_update;`,
				tz_str, start_date, end_date)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var history InvSumHistory
				if err := rows.Scan(
					&history.Inventory,
					&history.Date); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}

				sumHistories = append(sumHistories, history)
			}
			locSumHistory.Histories = sumHistories
			histories = append(histories, locSumHistory)

			w.Header().Set("Content-Type", "application/json")
			js, err := json.Marshal(histories)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)

		} else if history_type == "items" {

			// XXX A note here:
			// It is much easier for the client application to return the data sorted
			// first order by beverage using InvItemSumHistory.
			// However, for creating a spreadsheet, it is much easier for the server
			// createXlsxFile function to have the data sorted first order by date.
			// Hence, depending on whether 'export' is specified by the user,
			// the following code will implement different data results.

			item_ids := r.URL.Query()["ids"]

			if len(export) > 0 {
				// XXX can't just append to string, need to check ids are valid integers
				// or subject to injection attack.  Fix in future.
				var id_ints []int
				for _, id := range item_ids {
					id64, _ := strconv.ParseInt(id, 10, 0)
					idi := int(id64)
					id_ints = append(id_ints, idi)
				}

				var dates timeArr
				var sorted_keys []string

				for _, id := range id_ints {
					rows, err := db.Query(`
						SELECT DISTINCT (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date AS local_update 
						FROM location_beverages, locations 
						WHERE location_beverages.update AT TIME ZONE 'UTC' BETWEEN $2 AND $3 
							AND locations.id=location_beverages.location_id AND locations.restaurant_id=$4 
							AND location_beverages.type='bev' 
							AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=(SELECT version_id FROM beverages WHERE id=$5) 
						ORDER BY local_update DESC;`,
						tz_str, start_date, end_date, restaurant_id, id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					defer rows.Close()
					for rows.Next() {
						var adate time.Time
						if err := rows.Scan(&adate); err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							continue
						}
						date_exists := false
						for _, existing_date := range dates {
							if existing_date == adate {
								date_exists = true
								break
							}
						}
						if !date_exists {
							dates = append(dates, adate)
						}
					}
				}
				sort.Sort(dates)
				for _, adate := range dates {
					sorted_keys = append(sorted_keys, adate.String())
				}

				log.Println(sorted_keys)

				var itemsByDate []InvDateItemHistory

				for _, a_date := range dates {
					var itemInv InvDateItemHistory
					itemInv.Date = a_date
					for _, id := range id_ints {
						rows, err := db.Query(`
							SELECT beverages.id, beverages.product, beverages.brewery, 
								COALESCE(SUM(
									CASE WHEN locations.type='tap' THEN 
										CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume 
										ELSE 0 END 
									ELSE location_beverages.quantity END),0), 
								SUM(COALESCE(location_beverages.wholesale,0)), 
								SUM(COALESCE(location_beverages.deposit,0)), 
								COALESCE(SUM(location_beverages.inventory),0) 
							FROM beverages, location_beverages, locations 
							WHERE (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date=$2::date 
								AND location_beverages.beverage_id=beverages.id 
								AND location_beverages.location_id=locations.id 
								AND locations.restaurant_id=$3 AND location_beverages.type='bev' 
								AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=(SELECT version_id FROM beverages WHERE id=$4) 
							GROUP BY beverages.id ORDER BY beverages.product ASC;`,
							tz_str, a_date, restaurant_id, id)
						if err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							return
						}

						defer rows.Close()
						for rows.Next() {
							var bevInv BeverageInv
							if err := rows.Scan(
								&bevInv.ID,
								&bevInv.Product,
								&bevInv.Brewery,
								&bevInv.Quantity,
								&bevInv.Wholesale,
								&bevInv.Deposit,
								&bevInv.Inventory); err != nil {
								log.Println(err.Error())
								http.Error(w, err.Error(), http.StatusInternalServerError)
								continue
							}
							log.Println(bevInv)
							itemInv.Histories = append(itemInv.Histories, bevInv)
						}
					}
					itemsByDate = append(itemsByDate, itemInv)
				}
				log.Println(itemsByDate)

				js, err := json.Marshal(itemsByDate)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}

				switch export {
				case "xlsx":
					log.Println("create xlsx")
					createXlsxFile(js, sorted_keys, "all_itemized", "items_", restaurant_id, w, r, email, start_date, end_date, tz_str)
				}

			} else {
				var item_histories []InvItemSumHistory

				for _, item_id := range item_ids {

					var item InvItemSumHistory
					err := db.QueryRow("SELECT product, brewery FROM beverages WHERE id=$1;", item_id).Scan(&item.Product, &item.Brewery)
					if err != nil {
						log.Println(err.Error())
						// if query failed will exit here, so loc_id is guaranteed below
						http.Error(w, err.Error(), http.StatusInternalServerError)
						return
					}
					log.Println(item)

					var histories []InvSumHistory

					rows, err := db.Query(`SELECT SUM(COALESCE(location_beverages.inventory,0)), 
							SUM(COALESCE(location_beverages.wholesale, 0)), 
							SUM(COALESCE(location_beverages.deposit, 0)), 
							COALESCE(SUM(
								CASE WHEN locations.type='tap' THEN 
									CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume 
									ELSE 0 END 
								ELSE location_beverages.quantity END),0), (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date AS local_update 
						FROM location_beverages, locations, beverages 
						WHERE location_beverages.location_id=locations.id 
							AND location_beverages.beverage_id=beverages.id 
							AND location_beverages.type='bev' 
							AND location_beverages.update AT TIME ZONE 'UTC' BETWEEN $2 AND $3 
							AND (SELECT version_id FROM beverages WHERE id=location_beverages.beverage_id)=(SELECT version_id FROM beverages WHERE id=$4) 
							AND locations.restaurant_id=$5 
						GROUP BY beverages.id, local_update ORDER BY local_update DESC;`,
						tz_str, start_date, end_date, item_id, restaurant_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						return
					}
					defer rows.Close()
					for rows.Next() {
						var history InvSumHistory
						if err := rows.Scan(
							&history.Inventory,
							&history.Wholesale,
							&history.Deposit,
							&history.Quantity,
							&history.Date); err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							continue
						}
						histories = append(histories, history)
					}
					item.Histories = histories
					item_histories = append(item_histories, item)
				}
				log.Println(item_histories)

				js, err := json.Marshal(item_histories)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				w.Write(js)
			}

		} else if history_type == "all_itemized" {
			// Select itemized inventory list from a given date (range)
			// Create a map with beverage id as key
			// Select all SUM(location_beverages.inventory) grouped by beverage_id
			// with update in the date range.

			log.Println("Printing date")
			log.Println(start_date)
			log.Println(end_date)

			var dates []time.Time
			var sorted_keys []string
			rows, err := db.Query(`
				SELECT DISTINCT (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date AS local_update 
				FROM location_beverages, locations 
				WHERE location_beverages.update AT TIME ZONE 'UTC' BETWEEN $2 AND $3 
					AND locations.id=location_beverages.location_id 
					AND locations.restaurant_id=$4 
				ORDER BY local_update DESC;`,
				tz_str, start_date, end_date, restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var adate time.Time
				if err := rows.Scan(&adate); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				dates = append(dates, adate)
				sorted_keys = append(sorted_keys, adate.String())
			}

			var itemsByDate []InvDateItemHistory

			for _, a_date := range dates {
				// First get BEVERAGES from location_beverages (not including empty
				// keg deposits)
				rows, err = db.Query(`
					SELECT beverages.id, beverages.product, beverages.brewery, 
					COALESCE(SUM(
						CASE WHEN locations.type='tap' THEN 
							CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume 
							ELSE 0 END 
						ELSE location_beverages.quantity END),0), 
					SUM(COALESCE(location_beverages.wholesale, 0)), 
					SUM(COALESCE(location_beverages.deposit, 0)), 
					COALESCE(SUM(location_beverages.inventory),0) 
				FROM beverages, location_beverages, locations 
				WHERE (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date=$2::date 
					AND location_beverages.beverage_id=beverages.id 
					AND location_beverages.location_id=locations.id 
					AND locations.restaurant_id=$3 AND location_beverages.type='bev' 
				GROUP BY beverages.id ORDER BY beverages.product ASC;`, tz_str, a_date, restaurant_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				var itemInv InvDateItemHistory
				itemInv.Date = a_date
				defer rows.Close()
				for rows.Next() {
					var bevInv BeverageInv
					if err := rows.Scan(
						&bevInv.ID,
						&bevInv.Product,
						&bevInv.Brewery,
						&bevInv.Quantity,
						&bevInv.Wholesale,
						&bevInv.Deposit,
						&bevInv.Inventory); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					log.Println(bevInv)
					bevInv.Type.String = "bev"
					bevInv.Type.Valid = true
					itemInv.Histories = append(itemInv.Histories, bevInv)
				}
				// Now get KEGS
				rows, err = db.Query(`
					SELECT kegs.id, distributors.name, kegs.volume, kegs.unit, 
						COALESCE(SUM(location_beverages.quantity),0), 
						SUM(COALESCE(location_beverages.wholesale,0)),
						SUM(COALESCE(location_beverages.deposit,0)), 
						COALESCE(SUM(location_beverages.inventory),0)  
					FROM kegs, distributors, location_beverages, locations 
					WHERE (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date=$2::date AND 
					location_beverages.beverage_id=kegs.id 
						AND kegs.distributor_id=distributors.id 
						AND location_beverages.location_id=locations.id 
						AND locations.restaurant_id=$3 AND location_beverages.type='keg' 
					GROUP BY kegs.id,distributors.name ORDER BY distributors.name ASC;`,
					tz_str, a_date, restaurant_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				defer rows.Close()
				for rows.Next() {
					var bevInv BeverageInv
					if err := rows.Scan(
						&bevInv.ID,
						&bevInv.Distributor,
						&bevInv.Volume,
						&bevInv.Unit,
						&bevInv.Quantity,
						&bevInv.Wholesale,
						&bevInv.Deposit,
						&bevInv.Inventory); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					log.Println(bevInv)
					bevInv.Type.String = "keg"
					bevInv.Type.Valid = true
					itemInv.Histories = append(itemInv.Histories, bevInv)
				}

				itemsByDate = append(itemsByDate, itemInv)

			}
			log.Println(itemsByDate)

			js, err := json.Marshal(itemsByDate)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			if len(export) > 0 {
				switch export {
				case "xlsx":
					log.Println("create xlsx")
					createXlsxFile(js, sorted_keys, history_type, "all_", restaurant_id, w, r, email, start_date, end_date, tz_str)
				}
			} else {
				w.Header().Set("Content-Type", "application/json")
				w.Write(js)
			}

		} else if history_type == "loc_itemized" {
			// We want to have the first order key be dates, and the second order
			// key be locations.  This way the user can view single location inventory
			// by date if they single out a single location with location filter
			// buttons (XXX future implementation), whereas the other ordering
			// would not have that possibility

			// Dates:
			//   Locations (OMIT TAPS):
			//     Item Inventories (ordered alphabetically)
			//   XXX Add taps back in as location

			var allDateInvs []InvLocSumsByDate

			// Step 1: Gather all unique dates.  This includes tap locations
			var dates []time.Time
			var sorted_keys []string
			rows, err := db.Query(`
				SELECT DISTINCT (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date AS local_update 
				FROM location_beverages, locations 
				WHERE location_beverages.update AT TIME ZONE 'UTC' BETWEEN $2 AND $3 
					AND locations.id=location_beverages.location_id AND locations.restaurant_id=$4 
				ORDER BY local_update DESC;`,
				tz_str, start_date, end_date, restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var adate time.Time
				if err := rows.Scan(&adate); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				dates = append(dates, adate)
				sorted_keys = append(sorted_keys, adate.String())
			}

			// Step 2: For each date, gather unique locations.
			// First, we gather while omitting tap locations
			// Then, we gather tap locations
			for _, a_date := range dates {
				var aDateInv InvLocSumsByDate
				aDateInv.Date = a_date
				// -------------------- Non Taps --------------------
				rows, err = db.Query(`
					SELECT DISTINCT location_beverages.location_id FROM location_beverages, locations 
					WHERE (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date=$2::date 
						AND locations.id=location_beverages.location_id AND locations.restaurant_id=$3 
						AND locations.type!='tap' 
					ORDER BY location_beverages.location_id ASC;`, tz_str, a_date, restaurant_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				defer rows.Close()
				for rows.Next() {
					var invLocSum InvLocItemHistory
					var loc_id int
					if err := rows.Scan(&loc_id); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					var loc_name NullString
					err := db.QueryRow("SELECT name FROM locations WHERE id=$1;", loc_id).Scan(&loc_name)
					if err != nil {
						// if query failed will exit here, so loc_id is guaranteed below
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					invLocSum.Location = loc_name

					// First do beverages
					inv_rows, err := db.Query(`
						SELECT location_beverages.beverage_id, beverages.product, beverages.brewery, 
							location_beverages.quantity, 
							location_beverages.wholesale, 
							location_beverages.deposit, 
							COALESCE(location_beverages.inventory,0) 
						FROM beverages, location_beverages 
						WHERE (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date=$2::date 
							AND location_beverages.beverage_id=beverages.id 
							AND location_beverages.location_id=$3 AND location_beverages.type='bev' 
						ORDER BY beverages.product ASC;`, tz_str, a_date, loc_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					defer inv_rows.Close()
					for inv_rows.Next() {
						var bevInv BeverageInv
						if err := inv_rows.Scan(
							&bevInv.ID,
							&bevInv.Product,
							&bevInv.Brewery,
							&bevInv.Quantity,
							&bevInv.Wholesale,
							&bevInv.Deposit,
							&bevInv.Inventory); err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							continue
						}
						bevInv.Type.String = "bev"
						bevInv.Type.Valid = true
						invLocSum.Histories = append(invLocSum.Histories, bevInv)
					}

					// Then do kegs

					keg_rows, err := db.Query(`
						SELECT location_beverages.beverage_id, distributors.name, kegs.volume, 
							kegs.unit, location_beverages.quantity, 
							location_beverages.wholesale, 
							location_beverages.deposit, 
							COALESCE(location_beverages.inventory,0) 
						FROM kegs, distributors, location_beverages 
						WHERE kegs.distributor_id=distributors.id 
							AND (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date=$2::date 
							AND location_beverages.beverage_id=kegs.id 
							AND location_beverages.location_id=$3 
							AND location_beverages.type='keg' 
						ORDER BY kegs.id ASC;`, tz_str, a_date, loc_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					defer keg_rows.Close()
					for keg_rows.Next() {
						var bevInv BeverageInv
						if err := keg_rows.Scan(
							&bevInv.ID,
							&bevInv.Distributor,
							&bevInv.Volume,
							&bevInv.Unit,
							&bevInv.Quantity,
							&bevInv.Wholesale,
							&bevInv.Deposit,
							&bevInv.Inventory); err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							continue
						}
						bevInv.Type.String = "keg"
						bevInv.Type.Valid = true
						invLocSum.Histories = append(invLocSum.Histories, bevInv)
					}

					aDateInv.LocHistories = append(aDateInv.LocHistories, invLocSum)
				}
				// ---------------------- Taps ----------------------
				var invLocSum InvLocItemHistory
				loc_name := "All Taps"
				invLocSum.Location.String = loc_name
				invLocSum.Location.Valid = true

				inv_rows, err := db.Query(`
					SELECT beverages.id, beverages.product, beverages.brewery, 
						COALESCE(SUM(CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume ELSE 0 END),0), 
						location_beverages.wholesale, 
						location_beverages.deposit, 
						COALESCE(location_beverages.inventory,0) 
					FROM beverages, location_beverages, locations 
					WHERE (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date=$2::date 
						AND location_beverages.beverage_id=beverages.id 
						AND location_beverages.location_id=locations.id 
						AND locations.restaurant_id=$3 AND locations.type='tap' 
					GROUP BY beverages.id, location_beverages.inventory, location_beverages.wholesale, location_beverages.deposit  
					ORDER BY beverages.product ASC;`, tz_str, a_date, restaurant_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				defer inv_rows.Close()
				for inv_rows.Next() {
					var bevInv BeverageInv
					if err := inv_rows.Scan(
						&bevInv.ID,
						&bevInv.Product,
						&bevInv.Brewery,
						&bevInv.Quantity,
						&bevInv.Wholesale,
						&bevInv.Deposit,
						&bevInv.Inventory); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					invLocSum.Histories = append(invLocSum.Histories, bevInv)
				}
				if len(invLocSum.Histories) > 0 {
					aDateInv.LocHistories = append(aDateInv.LocHistories, invLocSum)
				}

				allDateInvs = append(allDateInvs, aDateInv)
			}

			log.Println(allDateInvs)
			js, err := json.Marshal(allDateInvs)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			if len(export) > 0 {
				switch export {
				case "xlsx":
					log.Println("create xlsx")
					createXlsxFile(js, sorted_keys, history_type, "loc_", restaurant_id, w, r, email, start_date, end_date, tz_str)
				}
			} else {
				w.Header().Set("Content-Type", "application/json")
				w.Write(js)
			}

		} else if history_type == "type_itemized" {
			// Same ordering as loc_itemized, first order by dates, second order
			// by type.
			// We piggy back off the InvLocSum* structs which, though they have
			// second order name "Location", we're just using as "Type" here

			var allDateInvs []InvLocSumsByDate

			// Step 1: Gather all unique dates
			var dates []time.Time
			var sorted_keys []string
			rows, err := db.Query(`
				SELECT DISTINCT (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date AS local_update 
				FROM location_beverages, locations 
				WHERE location_beverages.update AT TIME ZONE 'UTC' BETWEEN $2 AND $3 
					AND locations.id=location_beverages.location_id AND locations.restaurant_id=$4 
				ORDER BY local_update DESC;`,
				tz_str, start_date, end_date, restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var adate time.Time
				if err := rows.Scan(&adate); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				dates = append(dates, adate)
				sorted_keys = append(sorted_keys, adate.String())
			}

			// Step 2: For each date, gather unique types
			for _, a_date := range dates {
				var aDateInv InvLocSumsByDate
				aDateInv.Date = a_date

				// First do beverages
				rows, err = db.Query(`
					SELECT DISTINCT beverages.alcohol_type FROM beverages, location_beverages, locations 
					WHERE (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date=$2::date 
						AND locations.id=location_beverages.location_id 
						AND locations.restaurant_id=$3 AND beverages.id=location_beverages.beverage_id 
						AND location_beverages.type='bev' 
					ORDER BY beverages.alcohol_type ASC;`, tz_str, a_date, restaurant_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}
				defer rows.Close()
				for rows.Next() {
					var invTypeSum InvLocItemHistory
					var type_name string
					if err := rows.Scan(&type_name); err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					invTypeSum.Location.String = type_name
					invTypeSum.Location.Valid = true

					inv_rows, err := db.Query(`
						SELECT beverages.id, beverages.product, beverages.brewery, 
							COALESCE(SUM(
								CASE WHEN locations.type='tap' THEN 
									CASE WHEN COALESCE(beverages.purchase_volume,0)>0 THEN location_beverages.quantity/beverages.purchase_volume 
									ELSE 0 END 
								ELSE location_beverages.quantity END),0), 
							SUM(COALESCE(location_beverages.wholesale,0)), 
							SUM(COALESCE(location_beverages.deposit,0)), 
							COALESCE(SUM(location_beverages.inventory),0) 
						FROM beverages, location_beverages, locations 
						WHERE (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date=$2::date 
							AND location_beverages.beverage_id=beverages.id 
							AND location_beverages.location_id=locations.id 
							AND beverages.alcohol_type=$3 AND locations.restaurant_id=$4 
							AND location_beverages.type='bev' 
						GROUP BY beverages.id ORDER BY beverages.product ASC;`, tz_str, a_date, type_name, restaurant_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						continue
					}
					defer inv_rows.Close()
					for inv_rows.Next() {
						var bevInv BeverageInv
						if err := inv_rows.Scan(
							&bevInv.ID,
							&bevInv.Product,
							&bevInv.Brewery,
							&bevInv.Quantity,
							&bevInv.Wholesale,
							&bevInv.Deposit,
							&bevInv.Inventory); err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							continue
						}
						bevInv.Type.String = "bev"
						bevInv.Type.Valid = true
						invTypeSum.Histories = append(invTypeSum.Histories, bevInv)
					}

					aDateInv.LocHistories = append(aDateInv.LocHistories, invTypeSum)
				}

				// Then do kegs
				var has_kegs bool
				err := db.QueryRow(`
					SELECT EXISTS(
						SELECT 1 FROM location_beverages 
						WHERE (update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date=$2::date 
							AND type='keg');`, tz_str, a_date).Scan(&has_kegs)
				if err != nil {
					// if query failed will exit here, so loc_id is guaranteed below
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				if has_kegs {
					var invTypeSum InvLocItemHistory
					invTypeSum.Location.String = "Keg Deposits"
					invTypeSum.Location.Valid = true

					rows, err := db.Query(`
						SELECT kegs.id, distributors.name, kegs.volume, kegs.unit, 
							SUM(COALESCE(location_beverages.quantity,0)), 
							SUM(COALESCE(location_beverages.wholesale,0)), 
							SUM(COALESCE(location_beverages.deposit,0)), 
							SUM(COALESCE(location_beverages.inventory,0)) 
						FROM kegs, distributors, location_beverages, locations 
						WHERE (location_beverages.update AT TIME ZONE 'UTC' AT TIME ZONE $1)::date=$2::date 
							AND location_beverages.location_id=locations.id 
							AND locations.restaurant_id=$3 AND location_beverages.type='keg' 
							AND location_beverages.beverage_id=kegs.id 
							AND kegs.distributor_id=distributors.id 
						GROUP BY kegs.id, distributors.name 
						ORDER BY distributors.name;`, tz_str, a_date, restaurant_id)
					if err != nil {
						log.Println(err.Error())
						http.Error(w, err.Error(), http.StatusInternalServerError)
						return
					}
					defer rows.Close()
					for rows.Next() {
						var bevInv BeverageInv
						if err := rows.Scan(
							&bevInv.ID,
							&bevInv.Distributor,
							&bevInv.Volume,
							&bevInv.Unit,
							&bevInv.Quantity,
							&bevInv.Wholesale,
							&bevInv.Deposit,
							&bevInv.Inventory); err != nil {
							log.Println(err.Error())
							http.Error(w, err.Error(), http.StatusInternalServerError)
							continue
						}
						bevInv.Type.String = "keg"
						bevInv.Type.Valid = true
						invTypeSum.Histories = append(invTypeSum.Histories, bevInv)
					}
					aDateInv.LocHistories = append(aDateInv.LocHistories, invTypeSum)
				}

				allDateInvs = append(allDateInvs, aDateInv)
			}

			log.Println(allDateInvs)
			js, err := json.Marshal(allDateInvs)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			if len(export) > 0 {
				switch export {
				case "xlsx":
					log.Println("create xlsx")
					createXlsxFile(js, sorted_keys, history_type, "type_", restaurant_id, w, r, email, start_date, end_date, tz_str)
				}
			} else {
				w.Header().Set("Content-Type", "application/json")
				w.Write(js)
			}
		}

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
}

// Adds an inventory item type to a location.
func invLocAPIHandler(w http.ResponseWriter, r *http.Request) {

	_, restaurant_id, err := sessionGetUserAndRestaurant(w, r)
	if err != nil {
		return
	}

	switch r.Method {

	case "GET":
		log.Println(r.URL.Query())
		loc_name := r.URL.Query().Get("name")
		loc_type := r.URL.Query().Get("type")

		var locBevs []LocBeverageApp
		log.Println(loc_name)

		if loc_name == "" || loc_type == "" {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		// Verify Location exists or quit
		var loc_id int
		err := db.QueryRow(`
			SELECT id FROM locations WHERE restaurant_id=$1 AND name=$2 AND type=$3;`,
			restaurant_id, loc_name, loc_type).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var last_update time.Time
		err = db.QueryRow("SELECT last_update FROM locations WHERE id=$1;", loc_id).Scan(&last_update)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

		// =========================================================================
		// Select BEVERAGES from location
		/*
			SELECT beverages.id, beverages.version_id, beverages.product, beverages.container_type, beverages.brewery, distributors.name, beverages.alcohol_type, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, kegs.deposit, location_beverages.quantity, location_beverages.inventory, location_beverages.update
			FROM beverages
				INNER JOIN location_beverages ON (beverages.id=location_beverages.beverage_id)
				LEFT OUTER JOIN distributors ON (beverages.distributor_id=distributors.id)
				LEFT OUTER JOIN kegs ON (beverages.keg_id=kegs.id)
			WHERE location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active AND location_beverages.type='bev'
			ORDER BY beverages.product ASC;
		*/
		rows, err := db.Query(`
			SELECT beverages.id, beverages.version_id, beverages.product, beverages.container_type, 
			beverages.brewery, distributors.name, beverages.alcohol_type, beverages.purchase_volume, 
			beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, kegs.deposit, 
			location_beverages.quantity, location_beverages.inventory, location_beverages.update 
			FROM beverages INNER JOIN location_beverages ON (beverages.id=location_beverages.beverage_id) 
			LEFT OUTER JOIN distributors ON (beverages.distributor_id=distributors.id) 
			LEFT OUTER JOIN kegs ON (beverages.keg_id=kegs.id) 
			WHERE location_beverages.location_id=$1 
			AND location_beverages.update=$2 AND location_beverages.active 
			AND location_beverages.type='bev' ORDER BY beverages.product ASC;`, loc_id, last_update)
		//rows, err := db.Query("SELECT beverages.id, beverages.version_id, beverages.product, beverages.container_type, beverages.brewery, distributors.name, beverages.alcohol_type, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, beverages.deposit, location_beverages.quantity, location_beverages.inventory, location_beverages.update FROM beverages, location_beverages, distributors WHERE beverages.id=location_beverages.beverage_id AND location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active LEFT OUTER JOIN distributors ON (beverages.distributor_id=distributors.id) ORDER BY beverages.product ASC;", loc_id, last_update)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var locBev LocBeverageApp
			locBev.Type = "bev"
			if err := rows.Scan(&locBev.ID, &locBev.VersionID, &locBev.Product, &locBev.ContainerType, &locBev.Brewery, &locBev.Distributor, &locBev.AlcoholType, &locBev.PurchaseVolume, &locBev.PurchaseUnit, &locBev.PurchaseCost, &locBev.PurchaseCount, &locBev.Deposit, &locBev.Quantity, &locBev.Inventory, &locBev.Update); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			// We need to do one more thing.  The beverage might have been updated
			// since last time inventory was done in this location (such as having
			// its purchase price changed).  In that case, we want to return the old
			// beverage_id (for saving purposes), and the old quantity, but everything
			// else we want to
			// retrieve from the NEW (current) beverage, so the user sees the latest
			// info about it.
			var most_recent_id int
			do_update := true
			err = db.QueryRow(`
				SELECT id FROM beverages 
				WHERE version_id=(SELECT version_id FROM beverages WHERE id=$1) AND current;`, locBev.ID).Scan(&most_recent_id)
			switch {
			// If there were no rows, that means the beverage was probably deleted (no current).  In that case don't do the update
			case err == sql.ErrNoRows:
				do_update = false
			case err != nil:
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			if do_update && most_recent_id != locBev.ID {
				// Note that we're NOT replacing beverages.id, since we want to return
				// the old id so it can be updated when we next PUT and save
				/*
					SELECT beverages.product, beverages.container_type, beverages.brewery, distributors.name, beverages.alcohol_type, beverages.purchase_volume, beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, kegs.deposit
					FROM beverages
						LEFT OUTER JOIN distributors ON (beverages.distributor_id=distributors.id)
						LEFT OUTER JOIN kegs ON (beverages.keg_id=kegs.id)
					WHERE beverages.id=$1;
				*/
				err = db.QueryRow(`
					SELECT beverages.product, beverages.container_type, beverages.brewery, 
					distributors.name, beverages.alcohol_type, beverages.purchase_volume, 
					beverages.purchase_unit, beverages.purchase_cost, beverages.purchase_count, 
					kegs.deposit 
					FROM beverages LEFT OUTER JOIN distributors ON (beverages.distributor_id=distributors.id) 
					LEFT OUTER JOIN kegs ON (beverages.keg_id=kegs.id) 
					WHERE beverages.id=$1;`, most_recent_id).Scan(&locBev.Product, &locBev.ContainerType, &locBev.Brewery, &locBev.Distributor, &locBev.AlcoholType, &locBev.PurchaseVolume, &locBev.PurchaseUnit, &locBev.PurchaseCost, &locBev.PurchaseCount, &locBev.Deposit)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					log.Println(err.Error())
					continue
				}
				// tell the client that their inventory value reflects an older
				// state of the beverage
				locBev.OutOfDate.Bool = true
				locBev.OutOfDate.Valid = true
			}
			// if do_update is false, that means there's no current id for this
			// beverage (which means it's been deleted).  In that case don't return
			// the beverage
			if do_update {
				locBevs = append(locBevs, locBev)
			}
		}

		// =========================================================================
		// Select KEGS from location
		/*
			SELECT kegs.id, kegs.version_id, distributors.name, kegs.volume, kegs.unit, kegs.deposit, location_beverages.quantity, location_beverages.inventory, location_beverages.update
			FROM kegs
				INNER JOIN location_beverages ON (kegs.id=location_beverages.beverage_id)
				INNER JOIN distributors ON (kegs.distributor_id=distributors.id)
			WHERE location_beverages.location_id=$1 AND location_beverages.update=$2 AND location_beverages.active AND location_beverages.type='keg'
			ORDER BY beverages.product ASC;
		*/
		rows, err = db.Query(`
			SELECT kegs.id, kegs.version_id, distributors.name, kegs.volume, kegs.unit, kegs.deposit, 
			location_beverages.quantity, location_beverages.inventory, location_beverages.update 
			FROM kegs INNER JOIN location_beverages ON (kegs.id=location_beverages.beverage_id) 
			INNER JOIN distributors ON (kegs.distributor_id=distributors.id) 
			WHERE location_beverages.location_id=$1 AND location_beverages.update=$2 
			AND location_beverages.active AND location_beverages.type='keg' 
			ORDER BY distributors.name ASC;`, loc_id, last_update)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var locBev LocBeverageApp
			locBev.Type = "keg"
			if err := rows.Scan(
				&locBev.ID, &locBev.VersionID, &locBev.Distributor, &locBev.PurchaseVolume,
				&locBev.PurchaseUnit, &locBev.Deposit, &locBev.Quantity, &locBev.Inventory,
				&locBev.Update); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			// We need to do one more thing.  The beverage might have been updated
			// since last time inventory was done in this location (such as having
			// its purchase price changed).  In that case, we want to return the old
			// beverage_id (for saving purposes), and the old quantity, but everything
			// else we want to
			// retrieve from the NEW (current) beverage, so the user sees the latest
			// info about it.
			var most_recent_id int
			do_update := true
			err = db.QueryRow(`
				SELECT id FROM kegs 
				WHERE version_id=(SELECT version_id FROM kegs WHERE id=$1) AND current;`, locBev.ID).Scan(&most_recent_id)
			switch {
			// If there were no rows, that means the beverage was probably deleted (no current).  In that case don't do the update
			case err == sql.ErrNoRows:
				do_update = false
			case err != nil:
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			if do_update && most_recent_id != locBev.ID {
				// We just need to replace things that can change from keg version to
				// version, such as volume, unit, and deposit.
				err = db.QueryRow(`
					SELECT kegs.volume, kegs.unit, kegs.deposit 
					FROM kegs WHERE kegs.id=$1;`, most_recent_id).Scan(&locBev.PurchaseVolume, &locBev.PurchaseUnit, &locBev.Deposit)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					log.Println(err.Error())
					continue
				}
				// tell the client that their inventory value reflects an older
				// state of the beverage
				locBev.OutOfDate.Bool = true
				locBev.OutOfDate.Valid = true
			}
			// if do_update is false, that means there's no current id for this
			// beverage (which means it's been deleted).  In that case don't return
			// the beverage
			if do_update {
				locBevs = append(locBevs, locBev)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(locBevs)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

		/* THIS IS DEPRECATED AND NO LONGER USED
		    * /inv/loc NOW SAVES LISTS OF ITEMS VIA PUT
		    * AND NOT VIA INDIVIDUAL ITEMS BEING POSTED
		    *
		   	case "POST":
		   		// A Post to location_beverages for inventory locations "adds" the beverage
		   		// to the location with 0 quantity.  It's not an inventory update, but
		   		// rather adding a beverage type to the inventory location.
		   		//
		   		// Expects beverage id, location name, bev type ('bev' or 'keg')
		   		log.Println("Received /inv/loc POST")
		   		decoder := json.NewDecoder(r.Body)
		   		var locBev LocBeverageApp
		   		err := decoder.Decode(&locBev)
		   		if err != nil {
		   			log.Println(err.Error())
		   			http.Error(w, err.Error(), http.StatusBadRequest)
		   			return
		   		}
		   		log.Println(locBev.ID)
		   		log.Println(locBev.Location)

		   		// Verify Location exists or quit
		   		var loc_id int
		   		// Note that locations are either 'bev' or 'tap', and kegs are stored in
		   		// 'bev' type locations.  This is not to be confused with locBev.Type,
		   		// which is beverage type of 'bev' or 'keg'.
		   		err = db.QueryRow(`SELECT id FROM locations
		   			WHERE restaurant_id=$1 AND name=$2 AND type='bev';`, restaurant_id, locBev.Location).Scan(&loc_id)
		   		if err != nil {
		   			// if query failed will exit here, so loc_id is guaranteed below
		   			log.Println(err.Error())
		   			http.Error(w, err.Error(), http.StatusInternalServerError)
		   			return
		   		}

		   		var last_update time.Time
		   		err = db.QueryRow("SELECT last_update FROM locations WHERE id=$1;", loc_id).Scan(&last_update)
		   		if err != nil {
		   			http.Error(w, err.Error(), http.StatusInternalServerError)
		   			log.Println(err.Error())
		   			return
		   		}

		   		// Verify Beverage exists
		   		log.Println("About the check if exists by checking version id")
		   		var version_id int
		   		if locBev.Type == "bev" {
		   			err = db.QueryRow(`
		   				SELECT version_id FROM beverages WHERE restaurant_id=$1 AND id=$2;`,
		   				restaurant_id, locBev.ID).Scan(&version_id)
		   		} else { // keg
		   			err = db.QueryRow(`
		   				SELECT kegs.version_id FROM kegs INNER JOIN distributors ON (distributors.id=kegs.distributor_id)
		   				WHERE kegs.id=$1 AND distributors.restaurant_id=$2;`, locBev.ID, restaurant_id).Scan(&version_id)
		   		}
		   		if err != nil {
		   			log.Println(err.Error())
		   			http.Error(w, err.Error(), http.StatusInternalServerError)
		   			return
		   		}

		   		//   Does LocationBeverage from last_update exist already?
		   		//   XXX Compare version_id of posted beverage against version_id of
		   		//   beverage_id of old entries
		   		//     If it already exists:
		   		//       If it's not active (deleted), restore active status
		   		//       If it is active, return, it already is in the location
		   		//   Else:
		   		//     Add as normal
		   		var existing_id int
		   		var active bool
		   		exists := true
		   		if locBev.Type == "bev" {
		   			err = db.QueryRow(`
		   				SELECT beverage_id, active FROM location_beverages
		   				WHERE location_id=$1 AND (
		   					SELECT beverages.version_id FROM beverages WHERE beverages.id=location_beverages.beverage_id
		   				)=$2 AND update=$3 AND type=$4;`, loc_id, version_id, last_update, locBev.Type).Scan(&existing_id, &active)
		   		} else { // keg
		   			err = db.QueryRow(`
		   				SELECT beverage_id, active FROM location_beverages
		   				WHERE location_id=$1 AND (
		   					SELECT kegs.version_id FROM kegs WHERE kegs.id=location_beverages.beverage_id
		   				)=$2 AND update=$3 AND type=$4;`, loc_id, version_id, last_update, locBev.Type).Scan(&existing_id, &active)
		   		}
		   		switch {
		   		// if there were no rows, that means the beverage was not already in location_beverages
		   		case err == sql.ErrNoRows:
		   			exists = false
		   		case err != nil:
		   			log.Println(err.Error())
		   			http.Error(w, err.Error(), http.StatusInternalServerError)
		   			return
		   		}
		   		if exists {
		   			if active {
		   				http.Error(w, "Posted item exists in location.", http.StatusInternalServerError)
		   				return
		   			} else {
		   				_, err = db.Exec(`
		   					UPDATE location_beverages SET active=TRUE
		   					WHERE location_id=$1 AND beverage_id=$2 AND update=$3 AND type=$4;`, loc_id, existing_id, last_update, locBev.Type)
		   				if err != nil {
		   					log.Println(err.Error())
		   					http.Error(w, err.Error(), http.StatusInternalServerError)
		   					return
		   				}
		   				// Return the previous quantity and inventory of the now restored bev
		   				var bevInv LocBeverageApp
		   				err = db.QueryRow(`
		   					SELECT quantity, inventory FROM location_beverages
		   					WHERE location_id=$1 AND beverage_id=$2 AND update=$3 AND type=$4 AND active;`, loc_id, existing_id, last_update, locBev.Type).Scan(
		   					&bevInv.Quantity,
		   					&bevInv.Inventory)
		   				bevInv.ID = locBev.ID
		   				// if the existing id is older than the posted id, set as inactive for client
		   				if existing_id != locBev.ID {
		   					bevInv.OutOfDate.Valid = true
		   					bevInv.OutOfDate.Bool = true
		   				}

		   				w.Header().Set("Content-Type", "application/json")
		   				// need to marshal pointer to struct or custom marshal interface of
		   				// NullFloat64 is never called
		   				js, err := json.Marshal(&bevInv)
		   				if err != nil {
		   					http.Error(w, err.Error(), http.StatusInternalServerError)
		   					return
		   				}
		   				w.Write(js)
		   			}
		   		} else {
		   			// doesn't exist yet, means good to add.
		   			// Set the new location_beverage entry's update time to last_update so it
		   			// appears with the other entries in this location.
		   			_, err = db.Exec(`
		   				INSERT INTO location_beverages (beverage_id, location_id, quantity, update, inventory, active, type)
		   				VALUES ($1, $2, 0, $3, 0, TRUE, $4);`, locBev.ID, loc_id, last_update, locBev.Type)
		   			if err != nil {
		   				log.Println(err.Error())
		   				http.Error(w, err.Error(), http.StatusInternalServerError)
		   				return
		   			}
		   		}
		*/ // POST

	case "PUT":

		// A PUT to inventory locations is what actually updates quantities of all
		// the beverage types in the location.
		log.Println("Received /inv/loc PUT")
		decoder := json.NewDecoder(r.Body)
		var batch LocBeverageAppBatch
		err := decoder.Decode(&batch)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Println(batch)
		// check location exists
		var loc_id int
		err = db.QueryRow(`
			SELECT id FROM locations WHERE restaurant_id=$1 AND name=$2 AND type=$3;`,
			restaurant_id, batch.Location, batch.Type).Scan(&loc_id)
		if err != nil {
			// if query failed will exit here, so loc_id is guaranteed below
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

		// XXX NEW LOGIC
		// If same_day, update all location_beverages with update=last_update AND active
		// to have update = cur_time.  Otherwise, duplicate (insert) all
		// location_beverages with update=last_update AND active, and set their
		// update to cur_time.
		// Then, update locations.last_update to cur_time.
		// Finally, update all location_beverages with update=last_update with the
		// posted values.
		var last_update time.Time
		err = db.QueryRow("SELECT last_update FROM locations WHERE id=$1;", loc_id).Scan(&last_update)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

		// We need to compare if the PUT was on the same date as the last PUT
		// using the user's local time, rather than UTC time, since the date
		// depends on the user's time zone.
		// 1. Get the time zone offset (in hours) posted from client
		// 2. convert cur_time, in UTC, to user's local time by subtracting
		//    time zone offset
		// 2. convert last_update from UTC to local time using time zone offset
		// 3. Check their date components, if they match, same_day = true

		cur_time := time.Now().UTC()
		tz_str, _ := getRestaurantTimeZone(restaurant_id)
		var tz_hour int
		err = db.QueryRow(`SELECT EXTRACT (TIMEZONE_HOUR FROM CURRENT_TIME AT TIME ZONE $1);`, tz_str).Scan(&tz_hour)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		// convert tz_hour to duration in hours
		hour_offset := time.Duration(tz_hour) * time.Hour

		// now that we have hour offset, add it to cur_time, which is in
		// UTC, to get the equivalent of the local time
		user_put_time := cur_time.Add(hour_offset)
		log.Println("USER TIME:")
		log.Println(user_put_time)

		user_last_update := last_update.Add(hour_offset)
		log.Println("LAST UPDATE TIME:")
		log.Println(user_last_update)

		user_year := user_put_time.Year()
		user_month := user_put_time.Month()
		user_day := user_put_time.Day()
		last_year := user_last_update.Year()
		last_month := user_last_update.Month()
		last_day := user_last_update.Day()
		same_day := false
		if user_year == last_year && user_month == last_month && user_day == last_day {
			same_day = true
		}

		log.Println("SAME DAY?")
		log.Println(same_day)

		// XXX This is where the NEW NEW logic comes in:
		// if same day, delete all the old entries
		// if not same day. just insert from posted items
		if same_day {
			_, err = db.Exec("DELETE FROM location_beverages WHERE update=$1 AND location_id=$2 AND active;", last_update, loc_id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				return
			}
		}

		// update location last_update
		_, err = db.Exec("UPDATE locations SET last_update=$1 WHERE id=$2;", cur_time, loc_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			log.Println(err.Error())
			return
		}

		// XXX In this loop, need to insert items into location_beverages as well
		// for new logic
		var total_inventory float32
		for i := range batch.Items {
			anItem := batch.Items[i]

			// XXX in future need to check that the posting user's ID matches each
			// item to be updated's user_id

			// check that the item id exists
			var exists bool
			if anItem.Type == "bev" {
				err = db.QueryRow(`
					SELECT EXISTS (SELECT 1 FROM beverages WHERE restaurant_id=$1 AND id=$2);`,
					restaurant_id, anItem.ID).Scan(&exists)
			} else { //keg
				err = db.QueryRow(`
					SELECT EXISTS (SELECT 1 FROM kegs INNER JOIN distributors ON (distributors.id=kegs.distributor_id) 
					WHERE kegs.id=$1 AND distributors.restaurant_id=$2);`, anItem.ID, restaurant_id).Scan(&exists)
			}
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			// A note here:
			// We are updating beverages from the LAST save.  The beverage info might
			// have changed (such as user updating pricing, etc), which will mean
			// a new id will exist in the beverages table with the same version_id as
			// the old beverage.  So we have to check if the beverage is current.
			// If it's not, need to replace the location_beverages beverage_id with
			// the most current id.
			var most_recent_id int
			do_update := true
			if anItem.Type == "bev" {
				err = db.QueryRow(`
					SELECT id FROM beverages 
					WHERE version_id=(SELECT version_id FROM beverages WHERE id=$1) AND current;`, anItem.ID).Scan(&most_recent_id)
			} else { // keg
				err = db.QueryRow(`
					SELECT id FROM kegs 
					WHERE version_id=(SELECT version_id FROM kegs WHERE id=$1) AND current;`, anItem.ID).Scan(&most_recent_id)
			}

			switch {
			// If there were no rows, that means the beverage was probably deleted (no current).  In that case don't do the update
			case err == sql.ErrNoRows:
				do_update = false
			case err != nil:
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			if do_update && most_recent_id != anItem.ID {
				anItem.ID = most_recent_id
			}

			// now, calculate its inventory value and save it in location_beverages
			// for easy retrieval.  This varies by location type:
			// + bev:
			//     inventory = (purchase_cost / purchase_count) * quantity + deposit * ceil(quantity)
			// + tap:
			//     if purchase_volume not null and not 0:
			//       inventory = (purchase_cost / purchase_count) * (quantity / purchase_volume) + deposit (assume 1 keg)
			//     else
			//       inventory = deposit
			// + keg:
			//     inventory = quantity * deposit
			inventory := float32(0)     // the TOTAL inventory = wholesale + total_deposit
			wholesale := float32(0)     // Inventory value without deposit, just raw goods
			total_deposit := float32(0) // Deposit value without wholesale
			unit_cost := float32(0)
			deposit := float32(0)

			// Calculate deposit
			if anItem.Type == "bev" {
				err = db.QueryRow("SELECT COALESCE(kegs.deposit, 0) FROM beverages LEFT OUTER JOIN kegs ON (beverages.keg_id=kegs.id) WHERE beverages.id=$1;", most_recent_id).Scan(&deposit)
			} else { // keg
				err = db.QueryRow("SELECT COALESCE(deposit, 0) FROM kegs WHERE id=$1;", most_recent_id).Scan(&deposit)
			}
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			if batch.Type == "bev" {
				if anItem.Type == "bev" {
					err = db.QueryRow("SELECT COALESCE(purchase_cost, 0) / COALESCE(purchase_count, 1) FROM beverages WHERE id=$1;", most_recent_id).Scan(&unit_cost)
					if err != nil {
						http.Error(w, err.Error(), http.StatusInternalServerError)
						log.Println(err.Error())
						continue
					}
					wholesale = float32(anItem.Quantity) * unit_cost
					total_deposit = deposit * float32(math.Ceil(float64(anItem.Quantity)))
				} else { // keg
					wholesale = 0
					total_deposit = float32(anItem.Quantity) * deposit
				}

			} else if batch.Type == "tap" {
				err = db.QueryRow("SELECT CASE WHEN COALESCE(purchase_volume,0)>0 THEN (COALESCE(purchase_cost,0)/COALESCE(purchase_count,1))/purchase_volume ELSE 0 END FROM beverages WHERE id=$1;", most_recent_id).Scan(&unit_cost)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					log.Println(err.Error())
					continue
				}
				wholesale = float32(anItem.Quantity) * unit_cost
				total_deposit = deposit
			} else {
				http.Error(w, "Encountered incorrect location type!", http.StatusInternalServerError)
				return
			}

			inventory = wholesale + total_deposit

			// finally, update its quantity and inventory in location_beverages
			// XXX HERE DO INSERTION
			_, err = db.Exec("INSERT INTO location_beverages (beverage_id, location_id, quantity, wholesale, deposit, inventory, update, active, type) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8);", anItem.ID, loc_id, anItem.Quantity, wholesale, total_deposit, inventory, cur_time, anItem.Type)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			total_inventory += inventory
		}

		var retLoc Location
		retLoc.LastUpdate = cur_time
		retLoc.Name = batch.Location
		retLoc.TotalInv = total_inventory
		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(retLoc)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

		/* LIKE POST, THIS IS DEPRECATED, SINCE WE DON'T DELETE
			 * INDIVIDUAL ITEMS FROM LOCATIONS, BUT RATHER SAVE OVER
			 * COUNTS OF LISTS OF ITEMS WHICH WERE MADE ON THE SAME DAY
		case "DELETE":
			loc_name := r.URL.Query().Get("location")
			item_id := r.URL.Query().Get("id")
			item_type := r.URL.Query().Get("type")

			// if item_type is not "keg" or "bev", error
			if item_type != "bev" && item_type != "keg" {
				http.Error(w, "Unrecognize item type posted to delete.", http.StatusInternalServerError)
				return
			}

			// Verify Location exists or quit
			var loc_id int
			err := db.QueryRow(`
				SELECT id FROM locations
				WHERE restaurant_id=$1 AND name=$2 AND type='bev';`, restaurant_id, loc_name).Scan(&loc_id)
			if err != nil {
				// if query failed will exit here, so loc_id is guaranteed below
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			// Verify beverage exists or quit
			var existing_item_id int
			if item_type == "bev" {
				err = db.QueryRow(`
					SELECT id FROM beverages
					WHERE restaurant_id=$1 AND id=$2;`, restaurant_id, item_id).Scan(&existing_item_id)
			} else { //keg
				err = db.QueryRow(`
					SELECT kegs.id FROM kegs INNER JOIN distributors ON (distributors.id=kegs.distributor_id)
					WHERE kegs.id=$1 AND distributors.restaurant_id=$2;`, item_id, restaurant_id).Scan(&existing_item_id)
			}
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				log.Println(err.Error())
				return
			}

			var last_update time.Time
			err = db.QueryRow("SELECT last_update FROM locations WHERE id=$1;", loc_id).Scan(&last_update)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				log.Println(err.Error())
				return
			}

			// XXX New logic:
			// To prevent duplicate entries (multiple inactive beverages in same location)
			// If last_update is within today's date, delete entry altogether
			// Otherwise set active = FALSE
			cur_time := time.Now().UTC()
			tz_str, _ := getRestaurantTimeZone(restaurant_id)
			var tz_hour int
			err = db.QueryRow(`SELECT EXTRACT (TIMEZONE_HOUR FROM CURRENT_TIME AT TIME ZONE $1);`, tz_str).Scan(&tz_hour)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}

			// convert tz_hour to duration in hours
			hour_offset := time.Duration(tz_hour) * time.Hour

			// now that we have hour offset, add it to cur_time, which is in
			// UTC, to get the equivalent of the local time
			user_put_time := cur_time.Add(hour_offset)
			log.Println("USER TIME:")
			log.Println(user_put_time)

			user_last_update := last_update.Add(hour_offset)
			log.Println("LAST UPDATE TIME:")
			log.Println(user_last_update)

			user_year := user_put_time.Year()
			user_month := user_put_time.Month()
			user_day := user_put_time.Day()
			last_year := user_last_update.Year()
			last_month := user_last_update.Month()
			last_day := user_last_update.Day()
			same_day := false
			if user_year == last_year && user_month == last_month && user_day == last_day {
				same_day = true
			}

			log.Println("SAME DAY?")
			log.Println(same_day)

			if same_day {
				// if deletion happens the same day as last_update time, remove the
				// history entirely.  Doing inventory for an item and deleting it on
				// the same day does not record that day's history.
				_, err = db.Exec("DELETE FROM location_beverages WHERE location_id=$1 AND beverage_id=$2 AND update=$3 AND type=$4;", loc_id, item_id, last_update, item_type)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			} else {
				// if deletion happens on different day as last_update time, want to
				// preserve that history but stop it from propagating to next time's
				// inventory PUT operation.
				// set location_beverages.active of deleted entry to false
				_, err = db.Exec("UPDATE location_beverages SET active=FALSE WHERE location_id=$1 AND beverage_id=$2 AND update=$3 AND type=$4;", loc_id, item_id, last_update, item_type)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}
		*/ // DELETE

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return

	}
}
