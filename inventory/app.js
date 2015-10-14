'use strict';

// Declare app level module which depends on views, and components
angular.module('myApp', [
  'ngRoute',
  'myApp.viewAllInv',
  'myApp.viewDistributors',
  'myApp.viewSalesPlan',
//  'myApp.viewInvByLoc',
  'myApp.viewInvByLocNew',
//  'myApp.viewOnTap',
 // 'myApp.viewEmptyKegs',
  'myApp.viewHistory',
  'myApp.viewDeliveries'
]).
config(['$routeProvider', function($routeProvider) {
  $routeProvider.otherwise({redirectTo: '/viewAllInv'});
}])
// this tool tip config is to bypass a bug in Safari for closing popovers on
// focus.  See this issue:
// https://github.com/angular-ui/bootstrap/issues/3687
/*
.config(['$tooltipProvider', function($tooltipProvider){
  $tooltipProvider.setTriggers({
    'show': 'hide'
  });
}])
*/
/*
.directive('datepickerPopup', function (){
  return {
    restrict: 'EAC',
    require: 'ngModel',
    link: function(scope, element, attr, controller) {
      //remove the default formatter from the input directive to prevent conflict
      controller.$formatters.shift();
    }
  }
})
*/

.controller('myAppCtrl', function($scope, $location) {

  $scope.isActive = function (viewLocation) {
    var active = (viewLocation === $location.path());
    return active;
  };

})

.factory("MathService", function() {

  return {
    numIsInvalid: function(num) {
      return isNaN(num) || num < 0;
    },

    fixFloat2: function(fnum) {
      if (fnum===null || isNaN(fnum))
        return fnum
      return parseFloat(fnum.toFixed(2));
    },

    fixFloat1: function(fnum) {
      if (fnum===null || isNaN(fnum))
        return fnum
      return parseFloat(fnum.toFixed(1));
    },

    isInt: function(num) {
      return num % 1 === 0;
    }
  }
})

.factory("VolUnitsService", function($http) {

  return {
    get: function() {
      var promise = $http.get('/volume_units');
      return promise;
    }
  }
  
})

.factory("EmailService", function() {

  return {
    isValidEmail: function(email) {
      if (email.length < 5) {
        return false;
      }

      if (email.indexOf('@') < 0) {
        return false;
      }

      if (email.indexOf('.') < 0) {
        return false;
      }

      if (email.charAt(email.length-1) === '.') {
        return false;
      }
      
      return true;
      // the below uses regex rfc822 but I don't like it
      // return /^([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22))*\x40([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d))*$/.test( email );
    }
  }
})

.factory("ItemsService", function($http, MathService, DateService) {

  var getDisplayName = function(item) {
    if (item.type==='bev') {
      return item.product;
    } else if (item.type==='keg') {
      var volume = item['volume'];
      if (volume===undefined) {
        volume = item['purchase_volume'];
      }
      var unit = item['unit'];
      if (unit===undefined) {
        unit = item['purchase_unit'];
      }
      return item['distributor'] + ' ' + volume + ' ' + unit + ' Empty Keg';
    }
    return item.product;
  }

  var getItemIcon = function(item) {
    // get the icon type
    // draft beer (beer mug)
    // wine (wine bottle)
    // bottle (either beer or non-alc)
    // can (either beer or non-alc)
    // liquor (XO bottle)

    if (item.type==='keg') {
      return 'keg';
    }

    if (item.alcohol_type==='Beer' || item.alcohol_type==='Cider') {
      if (item.container_type==='Keg') {
        return 'draft';
      } else if (item.container_type==='Bottle') {
        return 'bottle';
      } else {
        return 'can'
      }
    } else if (item.alcohol_type==='Wine') {
      return 'wine';
    } else if (item.alcohol_type==='Liquor') {
      return 'liquor';
    } else {
      if (item.container_type==='Can') {
        return 'can'
      } else if (item.container_type==='Bottle') {
        return 'bottle'
      } else {
        return null; // XXX Default generic icon?
      }
    }
    return null;
  }

  var getBevUnitCost = function(bev) {
    // locally calculate unit_cost for sorting purposes
    var purchase_cost = 0;
    var purchase_count = 1;
    var deposit = 0;
    if (bev['purchase_cost'] !== null && bev['purchase_cost'] !== undefined) {
      purchase_cost = bev['purchase_cost'];
    }
    if (bev['purchase_count'] !== null && bev['purchase_count'] !== undefined) {
      purchase_count = bev['purchase_count'];
    }
    if (bev['deposit'] !== null && bev['deposit'] !== undefined) {
      deposit = bev['deposit'];
    }

    return purchase_cost / purchase_count + deposit;
  }

  return {

    getItemIcon: function(item) {
      return getItemIcon(item);
    },

    getDisplayName: function(item) {
      return getDisplayName(item);
    },

    getBevUnitCost: function(bev) {
      return getBevUnitCost(bev);
    },

    processBevsForAddable: function(bevs) {

      if (bevs===null || bevs.length === 0) {
        bevs = [];
      }

      for (var i in bevs) {
        var item = bevs[i];

        // fix a list of known keys to be decimal precision 2
        var fix_num_keys = [
          'abv',
          'count',
          'purchase_cost',
          'deposit'
        ];
        for (var j in fix_num_keys) {
          var fix_key = fix_num_keys[j];
          if ( item[fix_key] !== undefined && item[fix_key] !== null ) {
            item[fix_key] = MathService.fixFloat2(item[fix_key]);
          }
        }
        // now fix a list of known single precision
        fix_num_keys = [
          'purchase_count',
          'par',
          'purchase_volume',
          'volume',
        ];
        for (var j in fix_num_keys) {
          var fix_key = fix_num_keys[j];
          if ( item[fix_key] !== undefined && item[fix_key] !== null ) {
            item[fix_key] = MathService.fixFloat1(item[fix_key]);
          }
        }

        // if size_prices is null, make them empty array
        if (item.size_prices===undefined || item.size_prices===null) {
          item.size_prices = [];
        }

        // fix size_prices to be decimal precision 2
        for (var j in item.size_prices) {
          item.size_prices[j]['price'] = MathService.fixFloat2(item.size_prices[j]['price']);
          item.size_prices[j]['volume'] = MathService.fixFloat2(item.size_prices[j]['volume']);
        }

        if (item['sale_start']!==undefined && item['sale_start']!==null) {
          item['sale_start'] = DateService.getDateFromUTCTimeStamp(
            item['sale_start'], true);
        }

        if (item['sale_end']!==undefined && item['sale_end']!==null) {
          item['sale_end'] = DateService.getDateFromUTCTimeStamp(
            item['sale_end'], true);
        }
        
        // Note that the bevs might already have some of these fields defined
        // in the case of e.g., editing,
        // so only add them if one doesn't already exist
        if (item['inventory'] === undefined || item['inventory'] === null) {
          item['inventory'] = 0;
        }
        if (item['quantity'] === undefined || item['quantity'] === null) {
          item['quantity'] = 0;
        }
        if (item['type'] === undefined || item['type'] === null) {
          item['type'] = 'bev';
        }

        item['unit_cost'] = getBevUnitCost(item);

        item['display_name'] = getDisplayName(item);

        item['icon'] = getItemIcon(item);

      }
    },

    processKegsForAddable: function(kegs) {
      for (var i in kegs) {
        var keg = kegs[i];
        if (keg['inventory'] === undefined || keg['inventory'] === null) {
          keg['inventory'] = 0;
        }
        if (keg['quantity'] === undefined || keg['quantity'] === null) {
          keg['quantity'] = 0;
        }
        if (keg['type'] === undefined || keg['type'] === null) {
          keg['type'] = 'keg';
        }
        
        // fix floating point
        keg['volume'] = MathService.fixFloat1(keg['volume']);
        keg['purchase_cost'] = MathService.fixFloat1(keg['purchase_cost']);
        keg['deposit'] = MathService.fixFloat1(keg['deposit']);
        // when we get kegs from server, the param names 'volume' and 'unit'
        // don't match beverage params 'purchase_volume' and 'purchase_unit',
        // so we duplicate and rename so the proper vol and unit show up
        // on client display
        keg['purchase_volume'] = MathService.fixFloat1(keg['volume']);
        keg['purchase_unit'] = keg['unit'];
        // as a last hack, add distributor as product and brewery so sorting 
        // by those keys works
        keg['product'] = keg['distributor'];
        keg['brewery'] = keg['distributor'];

        keg['container_type'] = 'Empty Keg';
        keg['display_name'] = getDisplayName(keg);
        keg['icon'] = getItemIcon(keg);
      }
    }
  }
})

.factory("DateService", function() {

  var getMinutesSinceTime = function(timestamp) {
    var last_update = getDateFromUTCTimeStamp(timestamp, false);
    var dt_sec = (Date.now() - last_update) / 1000.0;
    return parseInt(dt_sec / 60.0);
  }

  var getDateFromUTCTimeStamp = function(timestamp, local) {
    // e.g., 2015-03-16
    var date_str = timestamp.substring(0,timestamp.indexOf('T'));
    // e.g., 07:43:49
    // sometimes the timestamp doesn't have a . in it, in which case look
    // to end at the Z, e.g., 0001-01-01T00:00:00Z
    var dot_index = timestamp.indexOf('.');
    if (dot_index < 0) {
      dot_index = 99999;
    }
    var z_index = timestamp.indexOf('Z');
    if (z_index < 0) {
      z_index = 99999;
    }
    var end_index = Math.min(dot_index, z_index);
    var time_str = timestamp.substring(
      timestamp.indexOf('T')+1,
      end_index);
    var date_comps = date_str.split('-');
    var time_comps = time_str.split(':');

    var utc_date = Date.UTC(
      date_comps[0], parseInt(date_comps[1])-1, date_comps[2],
      time_comps[0], time_comps[1], time_comps[2]);

    if (local === true) {
      return new Date(utc_date);
    } else {
      return utc_date;
    }
  }

  return {

    // helper function to get the number of minutes since a time stamp
    getPrettyTime: function(timestamp) {

      var mins_since_update = getMinutesSinceTime(timestamp);
      var years_since_update = mins_since_update / 60 / 24 / 365;

      // if years_since_update is greater than 50, we know this is 
      // a bogus timestamp
      var pretty_time = null;
      if (years_since_update > 50) {
        return null;
      }

      if (mins_since_update < 5) {
        pretty_time = 'Moments ago';
      } else if (mins_since_update < 60) {
        pretty_time = parseInt(mins_since_update).toString() + ' minutes ago';
      } else {
        return getDateFromUTCTimeStamp(timestamp, true).toLocaleString();
      }
      return pretty_time;
    },

    getPrettyDate: function (date_str, from_server, show_weekday) {
      // the timestamp from the server is different than the timestamp from
      // the client, so we need to handle as such

      var pretty_date = "";

      if (from_server) {
        // from the server, date_str looks like this:
        // 2015-07-19T00:00:00Z
        if (date_str.indexOf("T") >= 0) {
          date_str = date_str.split("T")[0];
        } else {
          date_str = date_str.split(" ")[0];
        }
        
        var date_tokens = date_str.split("-");
        date_str = new Date(parseInt(date_tokens[0]), parseInt(date_tokens[1])-1, parseInt(date_tokens[2])).toString();
        var pretty_tokens = date_str.split(" ");    
        pretty_date = pretty_tokens[0] + ", " + pretty_tokens[1] + " " + pretty_tokens[2] + " " + pretty_tokens[3];
      } else {
        // from the client, date_str looks like this:
        // Fri Aug 14 2015 20:10:00 GMT-0700 (PDT)
        // In that case, we take the first 4 tokens and add a comma to day
        var pretty_tokens = date_str.split(" ");
        if (show_weekday) {
          pretty_date = pretty_tokens[0] + ", " + pretty_tokens[1] + " " + pretty_tokens[2] + " " + pretty_tokens[3];
        } else {
          pretty_date = pretty_tokens[1] + " " + pretty_tokens[2] + " " + pretty_tokens[3];
        }
        
      }

      return pretty_date;
    },

    getDateFromUTCTimeStamp: function(timestamp, local) {
      return getDateFromUTCTimeStamp(timestamp, local)
    },

    timeZoneOffset: function() {
      // two notes here:
      // 1. getTimezoneOffset returns minutes, so need to divide by 60
      // 2. getTimezoneOffset returns a difference, so need to invert sign to
      //    get the +2, -6, etc sign correct in timestamps
      return (new Date().getTimezoneOffset()/60);
    },

    isValidDate: function(d) {
      if (d === null || d === undefined) {
        return false;
      }
      if ( Object.prototype.toString.call(d) !== "[object Date]" ) {
        return false;
      }
      return !isNaN(d.getTime());
    },

    // Given date d1 and date d2, returns the days between them
    daysBetween: function(d1, d2) {
      var ms_in_one_day = 1000 * 60 * 60 * 24; // milliseconds in a day
      var d1_ms = d1.getTime();
      var d2_ms = d2.getTime();
      var diff_ms = d2_ms - d1_ms;
      return Math.round(diff_ms/ms_in_one_day);
    }
  };
});

