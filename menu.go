package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/robfig/cron"
	"hash/fnv"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

func setupMenuPagesCron() {
	c := cron.New()

	// testing, run every minute
	//c.AddFunc("0 * * * * *", func() { go refreshMenuPages() })
	// run twice a day at 12 am and 12 pm
	c.AddFunc("0 0 0,11 * * *", func() { go refreshMenuPages() })
	c.Start()
}

func refreshMenuPages() {
	log.Println("Refreshing all Menu Pages")

	// get all restaurant ids in TABLE restaurants
	// for each one call createRestaurantMenuPage()

	rows, err := db.Query(`
    SELECT DISTINCT restaurants.id FROM restaurants, beverages 
    WHERE (SELECT COUNT(DISTINCT beverages.id) 
            FROM beverages WHERE beverages.restaurant_id=restaurants.id AND beverages.current AND COALESCE(beverages.sale_status, 'Inactive')!='Inactive') > 0;`)
	if err != nil {
		log.Println("ERROR getting restaurant IDs in refreshMenuPages")
		return
	}

	defer rows.Close()
	for rows.Next() {
		var restaurant_id string
		if err := rows.Scan(
			&restaurant_id); err != nil {
			continue
		}
		createRestaurantMenuPage(restaurant_id, nil, false)
	}
}

func setupMenuHandlers() {
	http.HandleFunc("/inv/menu", invMenuAPIHandler)
	http.HandleFunc("/inv/menu/count", invMenuCountAPIHandler)
	http.HandleFunc("/inv/menu/create", invMenuCreateAPIHandler)
	http.HandleFunc("/menu_pages/", menuPagesAPIHandler)
}

// this is a helper function that should be called before a user accesses
// their bev's sale_status info, e.g., before /inv GET, or /inv/menu GET
func inactivateExpiredSeasonals(w http.ResponseWriter, restaurant_id string) {

	cur_time := time.Now().UTC()
	result, err := db.Exec("UPDATE beverages SET sale_status='Inactive' WHERE sale_status='Seasonal' AND sale_end < $1 AND restaurant_id=$2;", cur_time, restaurant_id)
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	rows_affected, _ := result.RowsAffected()

	if rows_affected > 0 {
		go createRestaurantMenuPage(restaurant_id, w, false)
	}

}

func createMenuBevHTML(bev_type string, w http.ResponseWriter) string {

	html_content := ""

	var query string
	var title string

	if bev_type == "seasonal draft" {
		query = `
      SELECT id, product, brewery, abv FROM beverages 
      WHERE restaurant_id=$1 AND current AND container_type='Keg' 
      AND COALESCE(sale_status, 'Inactive')='Seasonal';`
		title = "SEASONAL DRAFTS"
	} else if bev_type == "staple draft" {
		query = `
      SELECT id, product, brewery, abv FROM beverages 
      WHERE restaurant_id=$1 AND current AND container_type='Keg' 
      AND COALESCE(sale_status, 'Inactive')='Staple';`
		title = "STAPLE DRAFTS"
	} else if bev_type == "bottled beer" {
		query = `
      SELECT id, product, brewery, abv FROM beverages 
      WHERE restaurant_id=$1 AND current AND container_type='Bottle' AND alcohol_type IN ('Beer', 'Cider') 
      AND COALESCE(sale_status, 'Inactive')!='Inactive';`
		title = "BOTTLED BEER"
	} else if bev_type == "wine" {
		query = `
      SELECT id, product, brewery, abv FROM beverages 
      WHERE restaurant_id=$1 AND current AND alcohol_type='Wine' 
      AND COALESCE(sale_status, 'Inactive')!='Inactive';`
		title = "WINE"
	} else if bev_type == "liquor" {
		query = `
      SELECT id, product, brewery, abv FROM beverages 
      WHERE restaurant_id=$1 AND current AND alcohol_type='Liquor' 
      AND COALESCE(sale_status, 'Inactive')!='Inactive';`
		title = "LIQUOR"
	} else if bev_type == "non alcoholic" {
		query = `
      SELECT id, product, brewery, abv FROM beverages 
      WHERE restaurant_id=$1 AND current AND alcohol_type='Non Alcoholic' 
      AND COALESCE(sale_status, 'Inactive')!='Inactive';`
		title = "NON-ALCOHOLIC"
	}

	rows, err := db.Query(query, test_restaurant_id)
	if err != nil {
		log.Println(err.Error())
		if w != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return html_content
	}

	var beverages []Beverage

	defer rows.Close()
	for rows.Next() {
		var bev Beverage
		if err := rows.Scan(
			&bev.ID,
			&bev.Product,
			&bev.Brewery,
			&bev.ABV); err != nil {
			log.Println(err.Error())
			if w != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			continue
		}

		srows, err := db.Query("SELECT serving_price FROM size_prices WHERE beverage_id=$1;", bev.ID)
		if err != nil {
			if w != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			continue
		}
		for srows.Next() {
			var sp SalePrice
			if err := srows.Scan(
				&sp.Price); err != nil {
				if w != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
				}
				continue
			}
			bev.SalePrices = append(bev.SalePrices, sp)
		}

		beverages = append(beverages, bev)
	}

	if len(beverages) > 0 {
		html_content += `
      <div class="row" style="margin-top:36px; margin-bottom:6px">
        <div class="col-xs-12" style="color:#777777; text-align:center; font-size:1.0em; font-weight:bold; text-decoration:underline">
          ` + title + `
        </div>
      </div>`

		for _, bev := range beverages {
			bev_line := fmt.Sprintf(`<span style="font-weight:400">%s</span>`, bev.Product)
			if bev.ABV.Valid == true {
				bev_line += fmt.Sprintf(` &nbsp;<span style="font-weight:400">%.1f%%</span>`, bev.ABV.Float64)
			}
			if bev.Brewery.Valid == true {
				bev_line += `<span style="color:#a0a0a0"> . . . . . ` + bev.Brewery.String + `</span>`
			}

			if len(bev.SalePrices) > 0 {
				bev_line += `<span style="float:right">`

				for i, sp := range bev.SalePrices {
					if sp.Price.Valid != true {
						continue
					}
					if i == 0 {
						bev_line += fmt.Sprintf("%.1f", sp.Price.Float64)
					} else {
						bev_line += fmt.Sprintf(" &nbsp;/ &nbsp;%.1f", sp.Price.Float64)
					}

				}

				bev_line += `</span>`
			}

			html_content += fmt.Sprintf(`
        <div class="row" style="padding-top:1px">
          <div class="col-xs-12" style="font-size:0.9em">
            %s
          </div>
        </div>`, bev_line)
		}
	}

	return html_content
}

func createRestaurantMenuPage(restaurant_id string, w http.ResponseWriter, do_http bool) {

	menu_dir := "./menu_pages/"
	if os.MkdirAll(menu_dir, 0755) != nil {
		if do_http == true {
			http.Error(w, "Unable to find or create menu_pages directory!", http.StatusInternalServerError)
		}
		return
	}

	var restaurant string
	err := db.QueryRow("SELECT name FROM restaurants WHERE id=$1;", restaurant_id).Scan(&restaurant)
	if err != nil {
		log.Println(err.Error())
		if do_http == true {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	// create a hash from user id as the filename extension
	h := fnv.New32a()
	h.Write([]byte(restaurant_id))
	hash := strconv.FormatUint(uint64(h.Sum32()), 10)
	filename := menu_dir + restaurant + "_" + hash + ".html"
	filename = strings.Replace(filename, " ", "_", -1)

	template_file := menu_dir + "menu_template.html"
	template, _ := ioutil.ReadFile(template_file)

	page_content := template

	page_content = bytes.Replace(page_content, []byte("[TITLE]"), []byte(restaurant+" Beverage Menu"), 1)
	page_content = bytes.Replace(page_content, []byte("[RESTAURANT]"), []byte(restaurant), 1)

	// get any Seasonal Beers / Ciders on tap
	// sale_status=="Seasonal"
	// container_type=="Keg"

	html_content := ""
	html_content += createMenuBevHTML("seasonal draft", w)
	html_content += createMenuBevHTML("staple draft", w)
	html_content += createMenuBevHTML("bottled beer", w)
	html_content += createMenuBevHTML("wine", w)
	html_content += createMenuBevHTML("liquor", w)
	html_content += createMenuBevHTML("non alcoholic", w)

	page_content = bytes.Replace(page_content, []byte("[CONTENT]"), []byte(html_content), 1)

	ioutil.WriteFile(filename, page_content, 0600)

	if do_http == true {
		var export ExportFile
		export.URL = filename[1:] // remove the . at the beginning

		log.Println(export)

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(export)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)
	}

}

func invMenuCreateAPIHandler(w http.ResponseWriter, r *http.Request) {

	privilege := checkUserPrivilege()

	// Creates a static Menu Page for customers to see
	// creates page in /menu_pages and returns a link
	switch r.Method {
	case "GET":

		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		createRestaurantMenuPage(test_restaurant_id, w, true)

	}

}

func invMenuCountAPIHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		// just returns the count of active menu items

		// when getting sales status, we always want to first set any seasonal
		// bevs whose sale_end period has ended to inactive
		go inactivateExpiredSeasonals(w, test_restaurant_id)

		var active_count ActiveMenuCount
		err := db.QueryRow("SELECT COUNT (DISTINCT id) FROM beverages WHERE restaurant_id=$1 AND current AND COALESCE(sale_status, 'Inactive')!='Inactive';", test_restaurant_id).Scan(&active_count.Count)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		js, err := json.Marshal(active_count)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	}
}

// invMenuAPIHandler handles menu planning requests, such as getting
// staple, seasonal, or inactive sales items.
func invMenuAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "GET":

		// when getting sales status, we always want to first set any seasonal
		// bevs whose sale_end period has ended to inactive
		go inactivateExpiredSeasonals(w, test_restaurant_id)

		sale_status := r.URL.Query().Get("sale_status")

		rows, err := db.Query(`
      SELECT id, version_id, product, distributor_id, container_type, 
      serve_type, brewery, alcohol_type, 
      purchase_volume, purchase_unit, purchase_cost, purchase_count, 
      sale_status, sale_start, sale_end, par 
      FROM beverages WHERE restaurant_id=$1 AND current 
      AND COALESCE(sale_status, 'Inactive')=$2;`, test_restaurant_id, sale_status)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var beverages []BeverageSalePlan

		defer rows.Close()
		for rows.Next() {
			var bev BeverageSalePlan
			if err := rows.Scan(
				&bev.ID,
				&bev.VersionID,
				&bev.Product,
				&bev.DistributorID,
				&bev.ContainerType,
				&bev.ServeType,
				&bev.Brewery,
				&bev.AlcoholType,
				&bev.PurchaseVolume,
				&bev.PurchaseUnit,
				&bev.PurchaseCost,
				&bev.PurchaseCount,
				&bev.SaleStatus,
				&bev.SaleStart,
				&bev.SaleEnd,
				&bev.Par); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			beverages = append(beverages, bev)
		}

		for i := range beverages {
			bev := beverages[i]

			var err error
			count_recent, last_inv_update, _ := getBeverageRecentInventory(bev.VersionID)
			beverages[i].CountRecent = count_recent
			beverages[i].LastInvUpdate = last_inv_update

			// get size_prices
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

		// user posts beverage's id, par, and sale_status.  We want to change the
		// beverage's sale status and par
		decoder := json.NewDecoder(r.Body)
		var bev Beverage
		err := decoder.Decode(&bev)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		var exists bool
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM beverages WHERE restaurant_id=$1 AND id=$2);", test_restaurant_id, bev.ID).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !exists {
			http.Error(w, "The beverage does not belong to the user!", http.StatusInternalServerError)
			return
		}

		// make sure we get the latest id from version_id
		var latest_id int

		err = db.QueryRow("SELECT id FROM beverages WHERE version_id=(SELECT version_id FROM beverages WHERE id=$1) AND current;", bev.ID).Scan(&latest_id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		_, err = db.Exec("UPDATE beverages SET sale_status=$1, par=$2 WHERE id=$3;", bev.SaleStatus, bev.Par, latest_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		log.Println(bev)
		log.Println(latest_id)

		// if sale_status is 'Seasonal', also update sale_start and sale_end
		if bev.SaleStatus.Valid && bev.SaleStatus.String == "Seasonal" {
			_, err = db.Exec("UPDATE beverages SET sale_start=$1, sale_end=$2 WHERE id=$3;", bev.SaleStart, bev.SaleEnd, latest_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		createRestaurantMenuPage(test_restaurant_id, w, false)

	default:
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

}
