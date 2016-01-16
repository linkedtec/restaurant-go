'use strict';

angular.module('myApp.viewMarginCalc', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewMarginCalc', {
    templateUrl: 'view_margin_calc/view_margin_calc.html',
    controller: 'ViewMarginCalcCtrl'
  });
}])

.controller('ViewMarginCalcCtrl', function($scope, $modal, $http, $filter, ItemsService, MathService, VolUnitsService) {

  // sorting
  $scope.sort_key = null;
  $scope.double_sort = -1;
  $scope.firstTimeSort = true;
  $scope.group_by_type = {'value':true};

  $scope.all_beverages = null;
  $scope.beverages = null;
  $scope.volume_units_full = null;

  $scope.active_filters = ['Active Beverages', 'Staples Only', 'Seasonal Only', 'All Beverages'];
  $scope.active_filter = $scope.active_filters[0];

  $scope.filter_query = {'query':''};

  $scope.target_margin = {'value': 4.0};

  $scope.selectActiveFilter = function(type) {
    $scope.active_filter = type;
    $scope.applyActiveFilter();
  }

  $scope.applyActiveFilter = function() {

    var allowed_statuses = [];
    if ($scope.active_filter===$scope.active_filters[0]) {
      // active beverages only
      allowed_statuses = ['Staple', 'Seasonal'];
    } else if ($scope.active_filter===$scope.active_filters[1]) {
      allowed_statuses = ['Staple'];
    } else if ($scope.active_filter===$scope.active_filters[2]) {
      allowed_statuses = ['Seasonal'];
    } else {
      allowed_statuses = ['Staple', 'Seasonal', 'Inactive', null];
    }

    $scope.beverages = [];
    for (var i in $scope.all_beverages) {
      var bev = $scope.all_beverages[i];
      var sale_status = bev['sale_status'];
      if (allowed_statuses.indexOf(sale_status) >= 0) {
        $scope.beverages.push(bev);
      }
    }

    if ($scope.firstTimeSort) {
      $scope.firstTimeSort = false;
      $scope.sortBy('margin');
    } else {
      $scope.sortBy($scope.sort_key);
      $scope.sortBy($scope.sort_key);
    }

  };

  $scope.targetMarginChanged = function() {
    console.log($scope.target_margin.value);

    var target = $scope.target_margin.value;
    if (target===undefined || target===null || MathService.numIsInvalidOrNegative(target)) {
      return;
    }

    for (var i in $scope.all_beverages) {
      var item = $scope.all_beverages[i];

      if (item['size_prices']===null || item['size_prices'].length===0) {
        continue;
      }

      for (var j in item['size_prices']) {
        var sp = item['size_prices'][j];
        $scope.calculateMarginColor(sp);
      }
    }
  }

  $scope.calculateMarginColor = function(sp) {
    if (sp['margin'] === null) {
      return;
    }

    var diff = sp['margin'] - $scope.target_margin.value;
    var pct = diff / $scope.target_margin.value;
    if (diff >= 0) {
      // if margin is 25% above target margin, dark green
      if ( pct >= 0.25) {
        sp['margin_color'] = '#1B6B00; font-weight:bold;';
        sp['margin_bg_color'] = '#B4E278;';
      } else {
        // otherwise, regular green
        sp['margin_color'] = '#228800; font-weight:bold;';
        sp['margin_bg_color'] = '#D3F3AA;';
      }
      
    } else if (diff < 0) {

      // if margin is 25% below target margin or below, red
      if (pct < -0.25) {
        sp['margin_color'] = '#cc2200; font-weight:bold;';
        sp['margin_bg_color'] = '#FFD3C1';
      } else {
        // otherwise, yellow
        sp['margin_color'] = '#aa8800; font-weight:bold;';
        sp['margin_bg_color'] = '#FFE8A6';
      }
    }
  };

  $scope.getBeverages = function() {

    $http.get('/inv').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      $scope.all_beverages = data;

      if ($scope.all_beverages===null || $scope.all_beverages.length === 0) {
        $scope.beverages = [];
      }

      ItemsService.processBevsForAddable($scope.all_beverages);

      $scope.getVolUnits();

    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getBeverages();

  $scope.getVolUnits = function() {
    var result = VolUnitsService.get();
    result.then(
      function(payload) {
        var data = payload.data;
        if (data !== null) {
          $scope.volume_units_full = data;
          for (var i in $scope.all_beverages) {
            var item = $scope.all_beverages[i];
            $scope.initMargins(item);
          }
          console.log($scope.all_beverages);

          $scope.applyActiveFilter();

          $scope.targetMarginChanged();

        }
      },
      function(errorPayload) {
        ; // do nothing for now
        $scope.volume_units_full = [];
      });
  };

  $scope.initMargins = function(item) {

    if (item['size_prices']===undefined || item['size_prices']===null) {
      return;
    }
    

    for (var i in item['size_prices']) {

      var sp = item['size_prices'][i];

      // Handle 'Unit' sales specially
      // if sold by 'Unit', margin is:
      //     sale_price / (purchase_cost / purchase_count) / sale_vol*
      //     * where sale_vol actually represents num units
      if (sp['unit']==='Unit') {
        var sale_price = sp['price'];
        var purchase_cost = item['purchase_cost'];
        var purchase_count = item['purchase_count'];
        var sale_units = sp['volume'];
        if (sale_price===null || purchase_cost===null || purchase_cost===0) {
          sp['margin'] = null;
          continue;
        }
        // purchase_cost / purchase_count yields cost per sold unit
        sp['margin'] = sale_price / (purchase_cost / purchase_count) / sale_units;
        continue;
      }
      else {
        // get price per volume for wholesale
        // get price per volume for single sale
        // price_per_volume_sale / price_per_volume_wholesale = margin
        var price_per_volume_wholesale = VolUnitsService.getPricePerVolume(
          item['purchase_volume'],
          item['purchase_unit'],
          item['purchase_cost'],
          item['purchase_count'],
          $scope.volume_units_full,
          'mL');
        if (price_per_volume_wholesale <= 0) {
          sp['margin'] = null;
          continue;
        }

        var price_per_volume_sale = VolUnitsService.getPricePerVolume(
          sp['volume'],
          sp['unit'],
          sp['price'],
          1, // sales is always by counts of 1
          $scope.volume_units_full,
          'mL');

        if (price_per_volume_sale < 0) {
          sp['margin'] = null;
        } else {
          sp['margin'] = price_per_volume_sale / price_per_volume_wholesale;
        }
      }
    }
  };

  $scope.sortBy = function(sort_str) {
    var double_sort = sort_str === $scope.sort_key;
    if (double_sort) {
      $scope.double_sort *= -1;
    } else {
      $scope.double_sort = -1;
    }
    $scope.sort_key = sort_str;

    var new_beverages = [];

    if ($scope.group_by_type.value===true) {
      // break down beverages into sublists based on alcohol_type
      // logic borrowed from view_sales_plan
      var alcohol_types = [];
      var type_item_dict = {};
      for (var i in $scope.beverages) {
        var item = $scope.beverages[i];

        if (item['is_title'] === true) {
          // 'is_title' is an attribute given to rows that are just meant to be
          // displayed as a subtitle of the alcohol type
          continue;
        }
        var alc_type = item['alcohol_type'];

        // special rule: cider should be sorted with beer
        if (alc_type === 'Cider') {
          alc_type = 'Beer';
        }

        if ( alcohol_types.indexOf(alc_type) < 0 ) {
          alcohol_types.push(alc_type);
          type_item_dict[alc_type] = [];
        }
        type_item_dict[alc_type].push(item);
      }
      alcohol_types.sort();
      console.log(alcohol_types);

      for (var i in alcohol_types) {
        var key = alcohol_types[i];
        if (type_item_dict.hasOwnProperty(key)) {
          // 'is_title' is an attribute given to rows that are just meant to be
          // displayed as a subtitle of the alcohol type
          new_beverages.push({product:key, is_title:true})
          new_beverages = new_beverages.concat(type_item_dict[key].sort($scope.sortFunc));
        }
      }
    } else {
      // remove all is_title bevs in case switching from group_by_type to not
      // group_by_type
      
      for (var i in $scope.beverages) {
        var item = $scope.beverages[i];
        if (item['is_title']===true) {
          ;
        } else {
          new_beverages.push(item);
        }
      }
      new_beverages.sort($scope.sortFunc);
    }
    
    console.log(new_beverages);
    $scope.beverages = new_beverages;
  };

  $scope.sortFunc = function(a, b) {
    var sort_str = $scope.sort_key;
    var isNum = (sort_str === 'abv' || sort_str === 'purchase_volume' || sort_str === 'purchase_cost' || sort_str==='margin');

    var keyA = null;
    var keyB = null;
    if (sort_str==='margin') {
      if (a.size_prices!==null && a.size_prices.length > 0)
      {
        keyA = a.size_prices[0][sort_str];
      } else {
        keyA = null;
      }
      if (b.size_prices!==null && b.size_prices.length > 0)
      {
        keyB = b.size_prices[0][sort_str];
      } else {
        keyB = null;
      }
    } else {
      keyA = a[sort_str];
      keyB = b[sort_str];
    }
    
    if ($scope.double_sort > 0) {
      if (keyA === null) {
        return -1;
      } else if (keyB === null) {
        return 1;
      }
      if (isNum)
      {
        return parseFloat(keyA) - parseFloat(keyB);
      } else {
        return -keyA.localeCompare(keyB);
      }
    }
    if (keyA === null) {
      return 1;
    } else if (keyB === null) {
      return -1;
    }
    if (isNum)
    {
      return parseFloat(keyB) - parseFloat(keyA);
    } else {
      return keyA.localeCompare(keyB);
    }
  };

});