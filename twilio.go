package main

import (
	"encoding/json"
	"errors"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"strings"
)

func twilioSendSMS(to_phone, content, restaurant_id string) (result string, err error) {

	// first check content is not beyond 1600 chars
	SMS_CHAR_LIMIT := 1600
	if len(content) == 0 {
		return "error", errors.New("SMS content is empty.")
	}

	if len(content) > SMS_CHAR_LIMIT {
		return "error", errors.New("SMS content is too long!")
	}

	// first check the sms_limits table for the restaurant_id and make sure
	// they haven't gone over their sms limit for the day
	SMS_DAILY_LIMIT := 20

	var sent_today int
	err = db.QueryRow("SELECT sent_today FROM sms_limits WHERE restaurant_id=$1;", restaurant_id).Scan(&sent_today)
	if err != nil {
		return "error", errors.New("Restaurant ID not found.")
	}

	if sent_today >= SMS_DAILY_LIMIT {
		return "error", errors.New("You've reached your SMS limit for today!  Please try again tomorrow.")
	}

	// twilio go code from reference here:
	// https://www.twilio.com/blog/2014/06/sending-sms-from-your-go-app.html
	twilio_accountSid := "AC89cdcb1bad430840cdf976e92576c098"
	twilio_authToken := "ba389307dd43463fddf7ef794e628245"
	twilio_phoneNumber := "6502001984"
	twilio_urlStr := "https://api.twilio.com/2010-04-01/Accounts/" + twilio_accountSid + "/Messages.json"

	// Build out the data for our message
	v := url.Values{}
	v.Set("To", to_phone)
	v.Set("From", twilio_phoneNumber)
	v.Set("Body", content)
	rb := *strings.NewReader(v.Encode())

	// Create client
	client := &http.Client{}

	req, _ := http.NewRequest("POST", twilio_urlStr, &rb)
	req.SetBasicAuth(twilio_accountSid, twilio_authToken)
	req.Header.Add("Accept", "application/json")
	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	// Make request
	resp, _ := client.Do(req)

	log.Println(resp)

	// a 2xx response means message was sent successfully
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		var data map[string]interface{}
		bodyBytes, _ := ioutil.ReadAll(resp.Body)

		// update sms_limits table with how many texts were sent.
		// we could do len(content) / 160 to get a rough estimate,
		// or we could somehow get the # texts from twilio's response?
		num_sent := 1
		_, _err := db.Exec("UPDATE sms_limits SET sent_today=$1 WHERE restaurant_id=$2;", sent_today+num_sent, test_restaurant_id)
		if _err != nil {
			log.Println(_err.Error())
			return "db error", _err
		}

		log.Println(data["sid"])

		_err = json.Unmarshal(bodyBytes, &data)
		if _err != nil {
			return "response error", _err
		}
		return "success", nil
	} else {
		log.Println(resp.Status)
	}

	return "error", errors.New("Twilio message unsuccessful.")

}
