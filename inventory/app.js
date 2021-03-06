'use strict';

// Declare app level module which depends on views, and components
angular.module('myApp', [
  'ngRoute',
  'angularSpinner',
  'myApp.viewDashboard',
  'myApp.viewAllInv',
  'myApp.viewMarkupCalc',
  'myApp.viewDistributors',
  'myApp.viewRestaurant',
  'myApp.viewSalesPlan',
  'myApp.viewPOSSales',
  'myApp.viewBudgetPlanner',
  'myApp.viewPurchaseOrders',
  'myApp.viewPurchaseHistory',
//  'myApp.viewInvByLoc',
  'myApp.viewInvByLocNew',
//  'myApp.viewOnTap',
 // 'myApp.viewEmptyKegs',
  'myApp.viewHistory',
  'myApp.viewMargins',
  'myApp.viewMissingRestaurant',
  'myApp.viewProfile'
]).
config(['$routeProvider', function($routeProvider) {
  $routeProvider.otherwise({redirectTo: '/viewDashboard'});
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

.config(['usSpinnerConfigProvider', function (usSpinnerConfigProvider) {
  usSpinnerConfigProvider.setTheme('default', {
    lines:11, radius:20, width:10, length:10, color:'#999', 
    shadow:false, opacity:0.2,  top:'45%'});
  //usSpinnerConfigProvider.setTheme('smallRed', {color: 'red', radius: 6});
}])

.run(function($rootScope, $http, DateService, UserService) {
  // Place run-once-at-startup functions here

  // Get the restaurant timezone from server so that when we post *specific
  // times to the server, we can adjust it to the correct time zone before 
  // posting.
  //
  // * A specific time is a time which is not "right now", and has hours
  // and minutes set by us.  "Right now" times do not need to be corrected for
  // time zone because they will be treated and saved as UTC.

  $http.get('/timezone')
  .success(function(data, status, headers, config) {
    DateService.setRestaurantTimezone(data['timezone']);
    DateService.setRestaurantTimezoneOffset(data['offset']);
  })
  .error(function(data, status, headers, config) {
    UserService.checkAjaxLoginRequired(data);
  });

})

.controller('myAppCtrl', function($scope, $location, $http, UserService) {

  $scope.isActive = function (viewLocation) {
    var active = (viewLocation === $location.path());
    return active;
  };

  if (!UserService.isLoaded()) {
    $http.get('/user')
    .success(function(data, status, headers, config) {
      console.log("PRINTING USER:");
      console.log(data);
      UserService.setUserInfo(data['first_name'], data['last_name'], data['email'], data['phone']);
      UserService.setLoaded(true);
      $scope.user = UserService.getUserInfo();
    })
    .error(function(data, status, headers, config) {
      UserService.checkAjaxLoginRequired(data);
    });
  };

  $scope.getFirstName = function() {
    return UserService.getFirstName();
  };
  

})

.factory("MathService", function() {

  /*
    Copyright (c) 2011 Andrei Mackenzie
    Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
    The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  */
  var _getLevenshteinDistance = function(a,b) {
    if(a.length == 0) return b.length; 
      if(b.length == 0) return a.length; 

      var matrix = [];

      // increment along the first column of each row
      var i;
      for(i = 0; i <= b.length; i++){
        matrix[i] = [i];
      }

      // increment each column in the first row
      var j;
      for(j = 0; j <= a.length; j++){
        matrix[0][j] = j;
      }

      // Fill in the rest of the matrix
      for(i = 1; i <= b.length; i++){
        for(j = 1; j <= a.length; j++){
          if(b.charAt(i-1) == a.charAt(j-1)){
            matrix[i][j] = matrix[i-1][j-1];
          } else {
            matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, // substitution
                                    Math.min(matrix[i][j-1] + 1, // insertion
                                             matrix[i-1][j] + 1)); // deletion
          }
        }
      }
      return matrix[b.length][a.length];
  }

  // performs a fuzzy heuristic to gauge how similar product1 and product2
  // are to each other, using name and brewery
  // Compare product
  //   Levenshtein distance * product_length/total_length
  // Compare brewery
  //   Levenshtein distance * brewery_length/total_length
  // Add them
  var _getBevNameFuzzyMatch = function(name1, name2, brewery1, brewery2) {

    if (name1 === null) {
      name1 = '';
    }
    if (name2 === null) {
      name2 = '';
    }
    if (brewery1 === null) {
      brewery1 = '';
    }
    if (brewery2 === null) {
      brewery2 = '';
    }

    var name_length = name1.length + name2.length;
    var brewery_length = brewery1.length + brewery2.length;
    var total_length = name_length + brewery_length;
    var name_weight = name_length / total_length;
    var brewery_weight = brewery_length / total_length;

    var name_score = _getLevenshteinDistance(name1, name2) * name_weight;
    var brewery_score = _getLevenshteinDistance(brewery1, brewery2) * brewery_weight;

    return (name_score + brewery_score) / total_length;
  }

  return {
    numIsInvalid: function(num) {
      return isNaN(num);
    },

    numIsInvalidOrNegative: function(num) {
      return isNaN(num) || num < 0;
    },

    fixFloat2: function(fnum) {
      if (fnum===null || isNaN(fnum))
        return fnum
      fnum = parseFloat(fnum);
      return parseFloat(fnum.toFixed(2));
    },

    fixFloat1: function(fnum) {
      if (fnum===null || isNaN(fnum))
        return fnum
      fnum = parseFloat(fnum);
      return parseFloat(fnum.toFixed(1));
    },

    isInt: function(num) {
      return num % 1 === 0;
    },

    getLevenshteinDistance: function(a, b){
      return _getLevenshteinDistance(a, b);
    },

    getBevNameFuzzyMatch: function(name1, name2, brewery1, brewery2) {
      return _getBevNameFuzzyMatch(name1, name2, brewery1, brewery2);
    }
  }
})

.factory("VolUnitsService", function($http) {

  /*
  var volume_units_full;
  var volume_units;

  $http.get('/volume_units').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      volume_units_full = data;
      volume_units = [];
      for (var i=0; i < data.length; i++)
      {
        volume_units.push(data[i].abbr_name);
      }
    }).
    error(function(data, status, headers, config) {
      volume_units_full = [];
      volume_units = [];
    });
*/
  
  var getVolumeInLiters = function(vol, unit, volume_units_array) {
    if (vol===null || unit===null) {
      return -1;
    }

    var in_liters = 0;
    for (var i=0; i < volume_units_array.length; i++){
      var vol_unit = volume_units_array[i];
      if (unit === vol_unit['abbr_name']) {
        in_liters = vol_unit['in_liters'];
        break;
      }
    }

    var vol_in_liters = in_liters * vol;
    return vol_in_liters;

  }
  

  return {
    get: function() {
      var promise = $http.get('/volume_units');
      return promise;
    },
    /*
    getVolumeUnitsFull: function() {
      return volume_units_full;
    }
    */

    getVolumeInLiters: function(vol, unit, volume_units_array) {
      return getVolumeInLiters(vol, unit, volume_units_array);
    },

    getPricePerVolume: function(vol, unit, cost, count, volume_units_array, cost_unit) {

      // returning -1 means invalid
      if (vol===null || unit===null || cost===null || count===null || count===undefined) {
        return -1;
      }

      // if volume is 0, return invalid
      if (vol === 0) {
        return -1;
      }

      // if count is less than 1, invalid
      if (count < 1) {
        return -1;
      }

      var vol_in_liters = getVolumeInLiters(vol, unit, volume_units_array);

      var cost_per_mL = cost / count / vol_in_liters / 1000.0;

      // if display is cost / mL
      if (cost_unit.indexOf('mL') >= 0) {
        return cost_per_mL;
      }
      // if display is cost / oz
      else if (cost_unit.indexOf('oz') >= 0) {
        return cost_per_mL * 29.5735;
      }
    }
  }
  
})

.factory("ContactService", function() {

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
    },
    isValidPhone: function(phone) {
      if (phone === null) {
        return false;
      }
      // make sure has 10 valid numbers
      var valid_nums = phone.replace(/[^0-9]/g,"").length;
      if (valid_nums < 10) {
        return false;
      }
      return true;
    }
  }
})

.factory("ItemsService", function($http, MathService, DateService) {

  var getResolvedSubtotal = function(item) {
    
    var additional_pricing = item['additional_pricing'];
    var subtotal = item['subtotal'];
    var resolved_subtotal = subtotal;

    if (additional_pricing===null || additional_pricing===undefined || additional_pricing.length===0) {
      return resolved_subtotal;
    } 
    else {     
      var purchase_cost = item['purchase_cost'];
      var quantity = item['quantity'];
      var deposit = item['deposit'];
      if (deposit===null || deposit===undefined) {
        deposit = 0;
      }

      var lead_char = additional_pricing[0];
      var trailing = additional_pricing.substring(1);

      // if start with + or -, modify is amount
      if (lead_char==='+' || lead_char==='-') {
        var add_sign = 1;
        if (lead_char==='-') {
          add_sign = -1;
        }

        var tokens = trailing.split('|');
        var value = MathService.fixFloat2(parseFloat(tokens[0]));
        var type = tokens[1];

        if (type==='unit') {
          purchase_cost += add_sign * value;
          if (purchase_cost < 0) {
            purchase_cost = 0;
          }
          var batch_cost = purchase_cost + deposit;
          resolved_subtotal = MathService.fixFloat2( batch_cost * quantity );

        } else {
          // apply to subtotal
          resolved_subtotal = MathService.fixFloat2( subtotal + (add_sign * value) );
        }

      }
      // if start with *, modify is percent
      else if (lead_char==='*') {
        var value = MathService.fixFloat2(parseFloat(trailing));

        var factor = 1.0 - parseFloat(value) / 100.0;
        purchase_cost *= factor;
        var batch_cost = purchase_cost + deposit;
        resolved_subtotal = MathService.fixFloat2( batch_cost * quantity );
      }

      if (resolved_subtotal < 0) {
        resolved_subtotal = 0;
      }
      return resolved_subtotal;
    }
  }

  var getAdditionalPricingShortDescription = function(additional_pricing, container_type, purchase_count, short_short) {
    if (additional_pricing===null || additional_pricing===undefined || additional_pricing.length===0) {
      return null;
    }

    var unit_str = getPOUnitName(container_type, purchase_count);
    var sign = additional_pricing[0];
    var trailing = additional_pricing.substring(1);
    if (sign==='*') {
      if (short_short===true) {
        return MathService.fixFloat2(trailing) + "% discount";
      } else {
        return "Apply " + MathService.fixFloat2(trailing) + "% discount";
      }
      
    } else {
      var value = trailing.split("|")[0];
      var apply_type = trailing.split("|")[1];
      var ret_str = "";
      if (sign==='+') {
        if (apply_type==='unit') {
          if (short_short===true) {
            return "+ $" + value + " /unit";
          } else {
            return "Add $" + value + " per " + unit_str;
          }
        } else {
          if (short_short===true) {
            return "+ $" + value + " subtotal";
          } else {
            return "Add $" + value + " to subtotal";
          }
        }
      } else {
        if (apply_type==='unit') {
          if (short_short===true) {
            return "- $" + value + " /unit";
          } else {
            return "Subtract $" + value + " per " + unit_str;
          }
        } else {
          if (short_short===true) {
            return "- $" + value + " subtotal";
          } else {
            return "Subtract $" + value + " from subtotal"; 
          }
        }
      }
    }
    return null;
  }

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

  var getPOUnitName = function(container_type, purchase_count) {
    if (purchase_count > 1) {
      return 'Case';
    }

    if (container_type !== null && container_type !== undefined) {
      return container_type;
    }

    return 'Unit';
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

  var getBevCost = function(bev, type) {
    // UNIT COST is the cost of each individual unit (as opposed to BATCH COST)
    // purchase_cost / purchase_count + deposit / purchase_count
    // @type can be 'unit' or 'batch'
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

    if (type === 'unit') {
      return ( purchase_cost + deposit ) / purchase_count;
    }

    return purchase_cost + deposit;
  }

  var calculateStockColor = function(item) {
    if (item['par'] === null || item['count_recent'] === null) {
      item['stock_color'] = '#000000';
      item['stock_bg_color'] = '#f8f8f8;';
      return;
    }
    if (item['par'] <= 0) {
      item['stock_color'] = '#000000';
      item['stock_bg_color'] = '#f8f8f8;';
      return;
    }
    var stock_pct = (item['count_recent'] / item['par']);
    if (stock_pct >= .66) {
      item['stock_color'] = '#228800;';
      item['stock_bg_color'] = '#D3F3AA;';
    } else if (stock_pct >= .33) {
      item['stock_color'] = '#aa8800; font-weight:bold;';
      item['stock_bg_color'] = '#FFE8A6';
    } else {
      item['stock_color'] = '#cc2200; font-weight:bold;';
      item['stock_bg_color'] = '#FFD3C1';
    }
  }

  return {

    getResolvedSubtotal: function(item) {
      return getResolvedSubtotal(item);
    },

    getAdditionalPricingShortDescription: function(additional_pricing, container_type, purchase_count, short_short) {
      return getAdditionalPricingShortDescription(additional_pricing, container_type, purchase_count, short_short);
    },

    getItemIcon: function(item) {
      return getItemIcon(item);
    },

    getDisplayName: function(item) {
      return getDisplayName(item);
    },

    getPOUnitName: function(container_type, purchase_count) {
      return getPOUnitName(container_type, purchase_count);
    },

    getBevUnitCost: function(bev) {
      return getBevCost(bev, 'unit');
    },

    getBevBatchCost: function(bev) {
      return getBevCost(bev, 'batch');
    },

    processPurchaseOrders: function(purchase_orders) {

      if (purchase_orders===null || purchase_orders.length===0) {
        purchase_orders = [];
      }

      for (var i in purchase_orders) {
        var total = 0.0;
        var po = purchase_orders[i];
        for (var j in po.distributor_orders) {
          var dist_order = po.distributor_orders[j];
          total += dist_order['total'];
        }
        po.order['total'] = total;
        po.order['order_date_pretty'] = DateService.getPrettyDate(po.order['order_date'], true, true);
        for (var j in po.distributor_orders) {
          var dorder = po.distributor_orders[j];
          dorder['delivery_date_pretty'] = DateService.getPrettyDate(dorder['delivery_date'], true, true);
        }

        if (po.order['send_method'] === 'email') {
          po.order['send_method_pretty'] = 'Email';
        } else if (po.order['send_method'] === 'text') {
          po.order['send_method_pretty'] = 'SMS Text';
        } else if (po.order['send_method'] === 'save') {
          po.order['send_method_pretty'] = 'Save Only'
        }
      }
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

        if (item['last_inv_update']!==undefined && item['last_inv_update']!==null) {
          item['last_inv_update_pretty'] = DateService.getPrettyDate(
            item['last_inv_update'], true, false);
        } else {
          item['last_inv_update'] = null;
          item['last_inv_update_pretty'] = null;
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

        // these are for displaying inv / par by the case, e.g., for PO
        if (item['par']!==undefined && item['par']!==null) {
          item['par_case'] = Math.ceil( item['par'] / item['purchase_count'] );
        } else {
          item['par_case'] = null;
        }
        if (item['count_recent']!==undefined && item['count_recent']!==null) {
          item['count_recent_case'] = Math.ceil( item['count_recent'] / item['purchase_count'] );
        } else {
          item['count_recent_case'] = null;
        }

        item['unit_cost'] = getBevCost(item, 'unit');

        item['batch_cost'] = getBevCost(item, 'batch');

        item['display_name'] = getDisplayName(item);

        item['po_unit'] = getPOUnitName(item['container_type'], item['purchase_count']);

        item['icon'] = getItemIcon(item);

        calculateStockColor(item);

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
    },

    calculateStockColor: function(item) {
      return calculateStockColor(item);
    }
  }
})

.factory("UserService", function($window) {

  var first_name = '';
  var last_name = '';
  var email = '';
  var phone = '';
  var loaded = false;

  var _setUserInfo = function(_first, _last, _email, _phone) {
    first_name = _first;
    last_name = _last;
    email = _email;
    phone = _phone;
    loaded = true;
  }

  return {

    setUserInfo: function(_first, _last, _email, _phone) {
      _setUserInfo(_first, _last, _email, _phone)
    },

    setLoaded: function(loaded) {
      loaded = loaded;
    },

    isLoaded: function() {
      return loaded;
    },

    getUserInfo: function() {
      return {
        first_name: first_name,
        last_name: last_name,
        email: email,
        phone: phone
      }
    },

    getFirstName: function() {
      return first_name;
    },

    setFirstName: function(_name) {
      first_name = _name;
    },

    getLastName: function() {
      return last_name;
    },

    setLastName: function(_name) {
      last_name = _name;
    },

    getEmail: function() {
      return email;
    },

    setEmail: function(_email) {
      email = _email;
    },

    getPhone: function() {
      return phone;
    },

    setPhone: function(_phone) {
      phone = _phone;
    },

    checkAjaxLoginRequired: function(response) {
      if ( response.startsWith("LOGIN_REQUIRED") ) {
        $window.location.href = '/login';
      } else if (response.startsWith("MISSING_RESTAURANT") ) {
        $window.location.href = '#/viewMissingRestaurant';
      }
    }

  }

})

.factory("DateService", function() {

  var restaurant_timezone = 'UTC';
  var restaurant_timezone_offset = 0;

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

  var _isValidDate = function(date) {
    if (date === null || date === undefined) {
      return false;
    }
    if ( Object.prototype.toString.call(date) !== "[object Date]" ) {
      return false;
    }
    return !isNaN(date.getTime());
  }

  var _isSameDay = function(date1, date2) {
    return (date1.getDate() == date2.getDate() && date1.getMonth() == date2.getMonth() && date1.getFullYear() == date2.getFullYear())
  }

  var _getRestaurantTimezone = function() {
    return restaurant_timezone;
  }

  var _getRestaurantTimezoneOffset = function() {
    return restaurant_timezone_offset;
  }

  var _getClientTimezoneOffset = function() {
    // two notes here:
      // 1. getTimezoneOffset returns minutes, so need to divide by 60
      // 2. Server time queries are POSIX, so no need to invert sign of
      //    offset here.
      return (new Date().getTimezoneOffset()/60);
  }

  return {

    setRestaurantTimezone: function(tz) {
      restaurant_timezone = tz;
    },

    getRestaurantTimezone: function() {
      return _getRestaurantTimezone();
    },

    setRestaurantTimezoneOffset: function(offset) {
      restaurant_timezone_offset = parseInt(offset);
    },

    getRestaurantTimezoneOffset: function() {
      return _getRestaurantTimezoneOffset();
    },

    getClientTimezoneOffset: function() {
      return _getClientTimezoneOffset();
    },

    clientTimeToRestaurantTime: function(in_time) {
      // In usual usage, client time and restaurant time should be the same.
      // e.g., if I'm an owner using the app in California, and my restaurant 
      // is in California.
      // However, if I'm on a business trip in Europe, and managing my 
      // restaurant remotely, then this helper function makes sure my user 
      // client time is converted to restaurant time.

      if (!_isValidDate(in_time)) {
        return in_time;
      }

      var offset_hours = _getRestaurantTimezoneOffset() - _getClientTimezoneOffset();
      return new Date(in_time.getTime() + (offset_hours*60*60*1000));
    },

    isSameDay: function(date1, date2) {
      return _isSameDay(date1, date2);
    },

    isFutureDay: function(date1, date2) {
      return !_isSameDay(date1, date2) && (date2.getTime() > date1.getTime());
    },

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
      var pretty_tokens = [];

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
        pretty_tokens = date_str.split(" ");    
      } else {
        // from the client, date_str looks like this:
        // Fri Aug 14 2015 20:10:00 GMT-0700 (PDT)
        // In that case, we take the first 4 tokens and add a comma to day
        pretty_tokens = date_str.split(" ");
      }

      if (show_weekday===true) {
        pretty_date = pretty_tokens[0] + ", " + pretty_tokens[1] + " " + pretty_tokens[2] + " " + pretty_tokens[3];
      } else {
        pretty_date = pretty_tokens[1] + " " + pretty_tokens[2] + ", " + pretty_tokens[3];
      }

      return pretty_date;
    },

    getDateFromUTCTimeStamp: function(timestamp, local) {
      return getDateFromUTCTimeStamp(timestamp, local)
    },

    isValidDate: function(date) {
      return _isValidDate(date);
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

