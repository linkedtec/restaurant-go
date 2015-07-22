package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type Distributor struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	DateCreated time.Time `json:"date_created"`
	Kegs        []DistKeg `json:"kegs"`
	BevCount    int       `json:"bev_count"`
}

type DistBev struct {
	ID      int        `json:"id"`
	Product string     `json:"product"`
	Brewery NullString `json:"brewery"`
}

type DistKeg struct {
	ID            int         `json:"id"`
	VersionID     int         `json:"version_id"`
	DistributorID int         `json:"distributor_id"`
	Volume        NullFloat64 `json:"volume"`
	Unit          string      `json:"unit"`
	Deposit       NullFloat64 `json:"deposit"`
	BevCount      int         `json:"bev_count"`
}

type DistributorUpdate struct {
	Dist       Distributor `json:"distributor"`
	ChangeKeys []string    `json:"change_keys"`
}

type KegUpdate struct {
	Keg        DistKeg  `json:"keg"`
	ChangeKeys []string `json:"change_keys"`
}

func setupDistributorHandlers() {
	http.HandleFunc("/distributors", distAPIHandler)
	http.HandleFunc("/kegs", kegsAPIHandler)
}

func kegsAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "POST":
		// adding new keg, expects the following:
		// distributor_id, volume, unit, deposit

		decoder := json.NewDecoder(r.Body)
		var keg DistKeg
		err := decoder.Decode(&keg)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if !keg.Volume.Valid {
			http.Error(w, "Invalid volume, quitting!", http.StatusInternalServerError)
		}

		// First check distributor_id belongs to user to authenticate
		var exists bool
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM distributors WHERE user_id=$1 AND id=$2);", test_user_id, keg.DistributorID).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !exists {
			http.Error(w, "Cannot find distributor associated with your user id!", http.StatusInternalServerError)
			return
		}

		// check volume and unit not existing
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM kegs WHERE volume=$1 AND unit=$2 AND current=TRUE AND distributor_id=$3);", keg.Volume, keg.Unit, keg.DistributorID).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if exists {
			http.Error(w, "Keg volume already exists for this distributor!", http.StatusInternalServerError)
			return
		}

		log.Println(keg)

		cur_time := time.Now().UTC()

		_, err = db.Exec("INSERT INTO kegs(distributor_id, volume, unit, deposit, start_date, current) VALUES($1, $2, $3, $4, $5, TRUE);", keg.DistributorID, keg.Volume, keg.Unit, keg.Deposit, cur_time)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var keg_id int
		err = db.QueryRow("SELECT last_value FROM kegs_id_seq;").Scan(&keg_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		_, err = db.Exec("UPDATE kegs SET version_id=$1 WHERE id=$2;", keg_id, keg_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		keg.ID = keg_id
		//keg.VersionID = keg_id			 // Don't provide version_id to client?

		// return the keg with the new ID so client has keg id
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		js, err := json.Marshal(&keg)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "PUT":
		decoder := json.NewDecoder(r.Body)
		var keg_update KegUpdate
		err := decoder.Decode(&keg_update)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Println(keg_update.Keg)
		log.Println(keg_update.ChangeKeys)

		var old_keg_id int
		err = db.QueryRow("SELECT id FROM kegs WHERE current=TRUE AND version_id=(SELECT version_id FROM kegs WHERE id=$1);", keg_update.Keg.ID).Scan(&old_keg_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var kegUpdateKeys []string
		for _, key := range keg_update.ChangeKeys {
			kegUpdateKeys = append(kegUpdateKeys, key)
		}

		// first get the old values from old keg entry
		var volume NullFloat64
		var unit string
		var deposit NullFloat64
		err = db.QueryRow("SELECT volume, unit, deposit FROM kegs WHERE id=$1;", old_keg_id).Scan(&volume, &unit, &deposit)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// then overwrite changed values from update keys
		for _, key := range kegUpdateKeys {
			if key == "volume" {
				volume = keg_update.Keg.Volume
			} else if key == "unit" {
				unit = keg_update.Keg.Unit
			} else if key == "deposit" {
				deposit = keg_update.Keg.Deposit
			}
		}

		// make sure keg volume doesn't currently exist
		var exists bool
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM kegs WHERE volume=$1 AND unit=$2 AND current=TRUE AND id!=$3 AND distributor_id=$4);", volume, unit, old_keg_id, keg_update.Keg.DistributorID).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if exists {
			http.Error(w, "Keg volume already exists for this distributor!", http.StatusInternalServerError)
			return
		}

		// gather all beverages which currently reference this keg_id
		var keg_bevs []DistBev
		rows, err := db.Query("SELECT id, product, brewery FROM beverages WHERE current=TRUE AND keg_id=$1 AND user_id=$2;", old_keg_id, test_user_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var bev DistBev
			if err := rows.Scan(
				&bev.ID,
				&bev.Product,
				&bev.Brewery); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			keg_bevs = append(keg_bevs, bev)
		}

		cur_time := time.Now().UTC()
		_, err = db.Exec("INSERT INTO kegs (distributor_id, volume, unit, deposit, version_id, current, start_date) SELECT distributor_id, $1, $2, $3, version_id, TRUE, $4 FROM kegs WHERE id=$5;", volume, unit, deposit, cur_time, old_keg_id)
		if err != nil {
			log.Println("Error 1")
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		log.Println("Old keg id:")
		log.Println(old_keg_id)

		var new_keg_id int
		err = db.QueryRow("SELECT last_value FROM kegs_id_seq;").Scan(&new_keg_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		log.Println("New keg id:")
		log.Println(new_keg_id)

		_, err = db.Exec("UPDATE kegs SET end_date=$1, current=FALSE where id=$2", cur_time, old_keg_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// update all keg bevs to reference the new keg id.  Must bump their version
		for _, bev := range keg_bevs {

			new_bev_id, err := updateBeverageVersion(bev.ID)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			// finally, update the keg_id
			_, err = db.Exec("UPDATE beverages SET keg_id=$1 where id=$2", new_keg_id, new_bev_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		w.Header().Set("Content-Type", "application/json")
		var keg DistKeg
		keg.Volume = volume
		keg.DistributorID = keg_update.Keg.DistributorID
		keg.Unit = unit
		keg.Deposit = deposit
		keg.ID = new_keg_id
		keg.BevCount = len(keg_bevs)
		js, err := json.Marshal(&keg)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "DELETE":

		// XXX This logic closely resembles /distributors DELETE, if any changes
		// go there they may need to be reflected here as well

		// XXX use test_user_id here to check user is authorized to delete this id

		keg_id := r.URL.Query().Get("id")
		force := r.URL.Query().Get("force")
		// do_check only check if any bevs currently reference keg
		// returns those bevs.  If none, carries out delete
		force_delete := false
		if force == "true" || force == "True" || force == "t" || force == "T" {
			force_delete = true
		}
		cur_time := time.Now().UTC()

		// A note here about force_delete.
		// Before we commit the deletion of a keg, which is a big action,
		// we first show the user all CURRENT bevs which reference the keg,
		// and make them manually confirm removal of keg for each and
		// every one of them.  So the first time the app calls DELETE, it will set
		// force=false to get back affected bev_ids, if any.
		// Only after that, we call DELETE again with force=true to actually
		// perform the deletions.
		//
		// HOWEVER, if force=false and there are no associated bev_ids, we will
		// go straight ahead to carry out the deletion.

		// Do any CURRENT beverages reference this keg_id?
		var keg_bevs []DistBev
		rows, err := db.Query("SELECT id, product, brewery FROM beverages WHERE current=TRUE AND keg_id=$1 AND user_id=$2;", keg_id, test_user_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var bev DistBev
			if err := rows.Scan(
				&bev.ID,
				&bev.Product,
				&bev.Brewery); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			keg_bevs = append(keg_bevs, bev)
		}

		// if there are any blocking bevs and we're not forcing delete, return the
		// blocking bevs and quit
		if len(keg_bevs) > 0 && !force_delete {
			w.Header().Set("Content-Type", "application/json")
			js, err := json.Marshal(keg_bevs)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)
			return
		}

		// If we got to here in the code, we're ready to forcefully delete the
		// keg and remove it from any and all referencing beverages.
		// Step 1.
		//   Is there history for any historical version of this keg?  Check if
		// any beverages references a keg_id whose version_id matches this keg.
		// Step 2.
		//   If there is no history, delete all keg_ids who match this version_id.
		//   If there is history, increment all keg_bevs (current bevs which use
		//   this keg_id) version to have NULL keg_id, and set this keg_id's
		//   current to FALSE and end_date

		// Step 1
		var version_id int
		err = db.QueryRow("SELECT version_id FROM kegs, distributors WHERE kegs.distributor_id=distributors.id AND distributors.user_id=$1 AND kegs.id=$2;", test_user_id, keg_id).Scan(&version_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var has_history bool
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM beverages, kegs WHERE kegs.version_id=$1 AND beverages.keg_id=kegs.id);", version_id).Scan(&has_history)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if has_history {

			// Update current bevs which reference keg to have NULL
			// keg and new version.
			for _, bev := range keg_bevs {
				old_bev_id := bev.ID

				new_bev_id, err := updateBeverageVersion(old_bev_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}

				_, err = db.Exec("UPDATE beverages SET keg_id=NULL where id=$1;", new_bev_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}

			// now deactivate this keg_id
			_, err = db.Exec("UPDATE kegs SET end_date=$1, current=FALSE where id=$2;", cur_time, keg_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

		} else {

			_, err = db.Exec("DELETE FROM kegs WHERE version_id=$1;", version_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

		}

		return
	}
}

func distAPIHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "GET":
		rows, err := db.Query("SELECT id, name, date_created FROM distributors WHERE user_id=$1 AND active=TRUE;", test_user_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var distributors []Distributor
		defer rows.Close()
		for rows.Next() {
			var dist Distributor
			if err := rows.Scan(
				&dist.ID,
				&dist.Name,
				&dist.DateCreated); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			var kegs []DistKeg
			krows, err := db.Query("SELECT id, volume, unit, deposit, version_id FROM kegs WHERE distributor_id=$1 AND current=TRUE;", dist.ID)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer krows.Close()
			for krows.Next() {
				var keg DistKeg
				if err := krows.Scan(
					&keg.ID,
					&keg.Volume,
					&keg.Unit,
					&keg.Deposit,
					&keg.VersionID); err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}

				bev_count := 0
				err = db.QueryRow("SELECT COUNT (DISTINCT id) FROM beverages WHERE current=TRUE and user_id=$1 AND keg_id=$2;", test_user_id, keg.ID).Scan(&bev_count)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					continue
				}

				keg.BevCount = bev_count
				kegs = append(kegs, keg)
			}

			bev_count := 0
			err = db.QueryRow("SELECT COUNT (DISTINCT id) FROM beverages WHERE current=TRUE AND user_id=$1 AND distributor_id=$2;", test_user_id, dist.ID).Scan(&bev_count)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			dist.Kegs = kegs
			dist.BevCount = bev_count
			distributors = append(distributors, dist)
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(distributors)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":
		decoder := json.NewDecoder(r.Body)
		var dist Distributor
		err := decoder.Decode(&dist)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Println(dist)

		// first check name and user_id pair doesn't exist
		var exists bool
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM distributors WHERE name=$1 AND user_id=$2);", dist.Name, test_user_id).Scan(&exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if exists {
			// if an old distributor was deleted (its active is set to FALSE),
			// restore its active to TRUE.
			// if an existing distributor which is active exists, return error
			var old_is_active bool
			err = db.QueryRow("SELECT active FROM distributors WHERE name=$1 AND user_id=$2;", dist.Name, test_user_id).Scan(&old_is_active)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if old_is_active {
				http.Error(w, "Distributor already exists!", http.StatusInternalServerError)
				return
			} else {
				_, err = db.Exec("UPDATE distributors SET active=TRUE WHERE name=$1 AND user_id=$2;", dist.Name, test_user_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				// now return the old distributor
				err = db.QueryRow("SELECT id, date_created FROM distributors WHERE name=$1 AND user_id=$2;", dist.Name, test_user_id).Scan(&dist.ID, &dist.DateCreated)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusCreated)
				js, err := json.Marshal(&dist)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				w.Write(js)
				return
			}
		}

		cur_time := time.Now().UTC()
		_, err = db.Exec("INSERT INTO distributors(name, user_id, date_created, active) VALUES ($1, $2, $3, TRUE);", dist.Name, test_user_id, cur_time)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var dist_id int
		err = db.QueryRow("SELECT last_value FROM distributors_id_seq;").Scan(&dist_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		dist.ID = dist_id
		dist.DateCreated = cur_time

		var validKegs []DistKeg // collect only valid keg entries

		// For each of the DistKeg items, insert entry into kegs
		for i := range dist.Kegs {
			akeg := dist.Kegs[i]
			// if both Volume and Deposit are empty, don't add an entry -- it means the
			// user left this blank
			if !akeg.Volume.Valid && !akeg.Deposit.Valid {
				continue
			}
			_, err = db.Exec("INSERT INTO kegs(distributor_id, volume, unit, deposit, start_date, current) VALUES($1, $2, $3, $4, $5, TRUE);", dist_id, akeg.Volume, akeg.Unit, akeg.Deposit, cur_time)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			var keg_id int
			err = db.QueryRow("SELECT last_value FROM kegs_id_seq;").Scan(&keg_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			_, err = db.Exec("UPDATE kegs SET version_id=$1 WHERE id=$2;", keg_id, keg_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}

			akeg.ID = keg_id
			akeg.VersionID = keg_id

			validKegs = append(validKegs, akeg)
		}

		dist.Kegs = validKegs

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		js, err := json.Marshal(&dist)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "PUT":
		decoder := json.NewDecoder(r.Body)
		var dist_update DistributorUpdate
		err := decoder.Decode(&dist_update)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println("got distributors PUT")
		log.Println(dist_update)

		dist_id := dist_update.Dist.ID
		nameChanged := false
		kegsChanged := false
		for _, key := range dist_update.ChangeKeys {
			if key == "name" {
				nameChanged = true
			} else if key == "kegs" {
				kegsChanged = true
			}
		}

		var dist_exists bool
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM distributors WHERE id=$1 AND user_id=$2);", dist_id, test_user_id).Scan(&dist_exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if !dist_exists {
			http.Error(w, "Distributor does not exist!", http.StatusInternalServerError)
			return
		}

		if nameChanged {
			_, err = db.Exec("UPDATE distributors SET name=$1 WHERE id=$2;", dist_update.Dist.Name, dist_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
		if kegsChanged {
			// XXX This logic is no longer relevant as kegs are individually edited
			// in the kegsAPIHandler, instead of in batch.  If things ever change
			// in the future, keeping this here as a stub
		}

	case "DELETE":

		// XXX This logic closely resembles /distributors DELETE, if any changes
		// go there they may need to be reflected here as well

		dist_id := r.URL.Query().Get("id")
		force := r.URL.Query().Get("force")

		// XXX use test_user_id here to check user is authorized to delete this id

		// do_check only check if any bevs currently reference distributor
		// returns those bevs.  If none, carries out delete
		force_delete := false
		if force == "true" || force == "True" || force == "t" || force == "T" {
			force_delete = true
		}
		cur_time := time.Now().UTC()

		// A note here about force_delete.
		// Before we commit the deletion of a distributor, which is a big action,
		// we first show the user all CURRENT bevs which reference the distributor,
		// and make them manually confirm removal of distributor for each and
		// every one of them.  So the first time the app calls DELETE, it will set
		// force=false to get back affected bev_ids, if any.
		// Only after that, we call DELETE again with force=true to actually
		// perform the deletions.
		//
		// HOWEVER, if force=false and there are no associated bev_ids, we will
		// go straight ahead to carry out the deletion.

		// Do any CURRENT beverages reference this distributor_id?
		// (Note: don't have to check individual keg ids, bevs can't point to a
		// distributor's kegs without point to its distributor_id)
		var dist_bevs []DistBev
		rows, err := db.Query("SELECT id, product, brewery FROM beverages WHERE current=TRUE AND distributor_id=$1 AND user_id=$2;", dist_id, test_user_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var bev DistBev
			if err := rows.Scan(
				&bev.ID,
				&bev.Product,
				&bev.Brewery); err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				continue
			}
			dist_bevs = append(dist_bevs, bev)
		}

		// if there are any blocking bevs and we're not forcing delete, return the
		// blocking bevs and quit
		if len(dist_bevs) > 0 && !force_delete {
			w.Header().Set("Content-Type", "application/json")
			js, err := json.Marshal(dist_bevs)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Write(js)
			return
		}

		// If we got to here in the code, we're ready to forcefully delete the
		// distributor and remove it from any and all referencing beverages.
		// Step 1.
		//   For any dist_bevs, set their current to false, end_date, and add a
		// new id version with distributor_id set to null.  This will clear this
		// distributor from any CURRENT bevs.  This is equivalent to an /inv edit
		// which is just clearing the distributor_id
		// Step 2.
		//   However, historical bevs might still reference this distributor_id.
		// Check if ANY bevs reference this distributor_id.  If any do, that means
		// historical versions of bevs used this distributor. If not, delete it and
		// all its associated kegs wholesale from the app.  Otherwise, just set
		// its active to FALSE.
		// Step 3. If set active to FALSE, update ALL its CURRENT kegs' current
		// to FALSE and add end_date, so that if distributor is resurrected,
		// it doesn't bring back its zombie kegs.

		// Step 1: Update current bevs which reference distributor to have NULL
		// distributor and new version.
		for _, bev := range dist_bevs {
			old_bev_id := bev.ID

			new_bev_id, err := updateBeverageVersion(old_bev_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			_, err = db.Exec("UPDATE beverages SET distributor_id=NULL, keg_id=NULL where id=$1;", new_bev_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		// Step 2: Check history and delete accordingly.  NOTE that any CURRENT bevs
		// in Step 1 will already have historical versions of this dist_id
		var dist_history_exists bool
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM beverages WHERE user_id=$1 AND distributor_id=$2);", test_user_id, dist_id).Scan(&dist_history_exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if dist_history_exists {

			_, err = db.Exec("UPDATE distributors SET active=FALSE WHERE id=$1;", dist_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			// Now go through distributor's kegs which are CURRENT and disable them
			_, err = db.Exec("UPDATE kegs SET end_date=$1, current=FALSE WHERE distributor_id=$2 AND current=TRUE;", cur_time, dist_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

		} else {
			// No beverages have ever been assigned this dist - delete wholesale
			// First, delete any kegs with the distributor_id.  If any historical
			// bevs referenced the keg_id, it would have referenced the distributor_id
			// as well, so it's safe to just delete the kegs here.

			_, err = db.Exec("DELETE FROM kegs WHERE distributor_id=$1;", dist_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			// Then, delete the distributor entry
			_, err = db.Exec("DELETE FROM distributors WHERE id=$1;", dist_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

	}
}
