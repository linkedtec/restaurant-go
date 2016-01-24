'use strict';

angular.module('myApp.viewMarkupCalc', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewMarkupCalc', {
    templateUrl: 'view_markup_calc/view_markup_calc.html',
    controller: 'ViewMarkupCalcCtrl'
  });
}])

.controller('ViewMarkupCalcCtrl', function($scope, $modal, $http, $filter, ItemsService, MathService, VolUnitsService) {

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

  $scope.target_markup = {'value': 4.0};

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
      $scope.sortBy('markup');
    } else {
      $scope.sortBy($scope.sort_key);
      $scope.sortBy($scope.sort_key);
    }

  };

  $scope.targetMarkupChanged = function() {
    console.log($scope.target_markup.value);

    var target = $scope.target_markup.value;
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
        $scope.calculateMarkupColor(sp);
      }
    }
  }

  $scope.calculateMarkupColor = function(sp) {
    if (sp['markup'] === null) {
      return;
    }

    var diff = sp['markup'] - $scope.target_markup.value;
    var pct = diff / $scope.target_markup.value;
    if (diff > -0.01) {
      // if markup is 25% above target markup, dark green
      if ( pct >= 0.25) {
        sp['markup_color'] = '#1B6B00; font-weight:bold;';
        sp['markup_bg_color'] = '#B4E278;';
      } else {
        // otherwise, regular green
        sp['markup_color'] = '#228800; font-weight:bold;';
        sp['markup_bg_color'] = '#D3F3AA;';
      }
      
    } else if (diff < 0) {

      // if markup is 25% below target markup or below, red
      if (pct < -0.25) {
        sp['markup_color'] = '#cc2200; font-weight:bold;';
        sp['markup_bg_color'] = '#FFD3C1';
      } else {
        // otherwise, yellow
        sp['markup_color'] = '#aa8800; font-weight:bold;';
        sp['markup_bg_color'] = '#FFE8A6';
      }
    }
  };

  $scope.editMarkup = function(item) {
    var modalEditInstance = $modal.open({
      templateUrl: 'editMarkupModal.html',
      controller: 'editMarkupModalCtrl',
      windowClass: 'edit-inv-modal',
      backdropClass: 'white-modal-backdrop',
      backdrop : 'static',
      resolve: {
        item: function() {
          return item;
        },
        target_markup: function() {
          return $scope.target_markup;
        },
        volume_units_full: function() {
          return $scope.volume_units_full;
        },
        volume_units: function() {
          return $scope.volume_units;
        }
      }
    });

    modalEditInstance.result.then(
      // success status
      function( result ) {
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is the affected beverage
        var status = result[0];
        var item = result[1];
        
        if (status === 'save') {

          console.log(item);

          swal({
            title: "Markup Updated!",
            text: "<b>" + item.product + "</b> has been updated with your changes.",
            type: "success",
            timer: 4000,
            allowOutsideClick: true,
            html: true});

          // recalculate the markups to update the item's markup and color
          $scope.initMarkups(item);
          $scope.targetMarkupChanged();
        }
      }, 
      // error status
      function() {
        ;
      });
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
          $scope.volume_units = [];
          for (var i=0; i < data.length; i++) {
            $scope.volume_units.push(data[i].abbr_name);
          }

          for (var i in $scope.all_beverages) {
            var item = $scope.all_beverages[i];
            $scope.initMarkups(item);
          }
          console.log($scope.all_beverages);

          $scope.applyActiveFilter();

          $scope.targetMarkupChanged();

        }
      },
      function(errorPayload) {
        ; // do nothing for now
        $scope.volume_units_full = [];
      });
  };

  $scope.initMarkups = function(item) {

    if (item['size_prices']===undefined || item['size_prices']===null) {
      return;
    }
    
    for (var i in item['size_prices']) {

      var sp = item['size_prices'][i];

      // Handle 'Unit' sales specially
      // if sold by 'Unit', markup is:
      //     sale_price / (purchase_cost / purchase_count) / sale_vol*
      //     * where sale_vol actually represents num units
      if (sp['unit']==='Unit') {
        var sale_price = sp['price'];
        var purchase_cost = item['purchase_cost'];
        var purchase_count = item['purchase_count'];
        var sale_units = sp['volume'];
        if (sale_price===null || purchase_cost===null || purchase_cost===0) {
          sp['markup'] = null;
          continue;
        }
        // purchase_cost / purchase_count yields cost per sold unit
        sp['markup'] = sale_price / (purchase_cost / purchase_count) / sale_units;
        continue;
      }
      else {
        // get price per volume for wholesale
        // get price per volume for single sale
        // price_per_volume_sale / price_per_volume_wholesale = markup
        var price_per_volume_wholesale = VolUnitsService.getPricePerVolume(
          item['purchase_volume'],
          item['purchase_unit'],
          item['purchase_cost'],
          item['purchase_count'],
          $scope.volume_units_full,
          'mL');
        if (price_per_volume_wholesale <= 0) {
          sp['markup'] = null;
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
          sp['markup'] = null;
        } else {
          sp['markup'] = price_per_volume_sale / price_per_volume_wholesale;
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
    var isNum = (sort_str === 'abv' || sort_str === 'purchase_volume' || sort_str === 'purchase_cost' || sort_str==='markup');

    var keyA = null;
    var keyB = null;
    if (sort_str==='markup') {
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

})

.controller('editMarkupModalCtrl', function($scope, $modalInstance, $http, BeveragesService, MathService, VolUnitsService, item, target_markup, volume_units_full, volume_units) {

  $scope.item = item;
  $scope.item_tmp = JSON.parse( JSON.stringify( $scope.item ) );
  $scope.target_markup = target_markup.value;
  $scope.volume_units_full = volume_units_full;
  $scope.volume_units = volume_units;
  $scope.new_failure_msg = null;

  // need to handle unit sale separately
  $scope.new_unit_sale = {
    value: null,
    markup: null};

  if ($scope.item_tmp['size_prices']===null || $scope.item_tmp['size_prices'].length===0) {
    $scope.item_tmp['size_prices'] = [{volume:null, unit:null, price:null}];
  } else {
    // need to handle unit sale price separately from other sale prices
    for (var i = 0; i < $scope.item_tmp['size_prices'].length; i++)
    {
      var sp = $scope.item_tmp['size_prices'][i];
      if (sp.unit === 'Unit') {
        $scope.new_unit_sale.value = sp.price;
        $scope.item_tmp.size_prices.splice(i,1);
        break;
      }
    }
  }

  console.log($scope.item);

  $scope.calculateMarkupColor = function(sp) {
    if (sp['markup'] === null) {
      sp['markup_color'] = '#777777; font-weight:bold';
      sp['markup_bg_color'] = '#e0e0e0;';
      return;
    }

    var diff = sp['markup'] - $scope.target_markup;
    var pct = diff / $scope.target_markup;
    if (diff > -0.01) {
      // if markup is 25% above target markup, dark green
      if ( pct >= 0.25) {
        sp['markup_color'] = '#1B6B00; font-weight:bold;';
        sp['markup_bg_color'] = '#B4E278;';
      } else {
        // otherwise, regular green
        sp['markup_color'] = '#228800; font-weight:bold;';
        sp['markup_bg_color'] = '#D3F3AA;';
      }
      
    } else if (diff < 0) {

      // if markup is 25% below target markup or below, red
      if (pct < -0.25) {
        sp['markup_color'] = '#cc2200; font-weight:bold;';
        sp['markup_bg_color'] = '#FFD3C1';
      } else {
        // otherwise, yellow
        sp['markup_color'] = '#aa8800; font-weight:bold;';
        sp['markup_bg_color'] = '#FFE8A6';
      }
    }
  };

  $scope.matchPriceToTarget = function(sp, is_unit_sale) {
    if (sp['target_sale_price']===null) {
      return;
    }

    var new_price = MathService.fixFloat2(sp['target_sale_price']);
    if (is_unit_sale) {
      sp.value = new_price;
    } else {
      sp['price'] = new_price;
    }

    $scope.calcMarkups();
  };

  $scope.calculatePriceToTargetMarkup = function(sp, is_unit_sale, price_per_volume_wholesale) {
    // note: this function is only called when markup is valid, so don't need
    // to check if params are null

    var purchase_cost = $scope.item_tmp['purchase_cost'];
    var purchase_count = $scope.item_tmp['purchase_count'];

    var target_sale_price = null;
    if (is_unit_sale===true) {
      // markup = sale_price / (purchase_cost / purchase_count) / sale_vol
      // so, 
      // sale_price = markup * (purchase_cost / purchase_count) * sale_vol
      var sale_units = 1;
      target_sale_price = $scope.target_markup * (purchase_cost / purchase_count) * sale_units;
    } else {
      // price_per_volume_sale = markup * price_per_volume_wholesale
      var target_price_per_volume_sale = $scope.target_markup * price_per_volume_wholesale;
      // once we get the required price_per_volume_sale, we figure out
      // what sale price is necessary to get that figure.  Note that since 
      // price_per_volume_wholesale is in mL, we need to reverse calculate 
      // target_price_per_volume_sale using mL
      //
      // target_price_per_volume_sale = sale_price / sale_count (1) / sale_volume_in_liters / 1000
      // sale_price = target_price_per_volume_sale * sale_count * sale_volume_in_liters * 1000
      var sale_volume_in_liters = VolUnitsService.getVolumeInLiters(
        sp['volume'],
        sp['unit'],
        $scope.volume_units_full);
      target_sale_price = target_price_per_volume_sale * 1 * sale_volume_in_liters * 1000;
    }

    sp['target_sale_price'] = target_sale_price;
    console.log('target sale price:');
    console.log(sp);

  };

  $scope.calcMarkups = function() {

    console.log('calc markups');

    var item = $scope.item_tmp;

    if ((item['size_prices']===undefined || item['size_prices']===null) && $scope.new_unit_sale['value']===null) {
      return;
    }

    // Handle 'Unit' sales specially
    // if sold by 'Unit', markup is:
    //     sale_price / (purchase_cost / purchase_count) / sale_vol*
    //     * where sale_vol actually represents num units
    if ($scope.new_unit_sale.value!==null) {
      var sale_price = $scope.new_unit_sale.value;
      var purchase_cost = $scope.item_tmp['purchase_cost'];
      var purchase_count = $scope.item_tmp['purchase_count'];
      var sale_units = 1;
      console.log(purchase_count);
      if (sale_price===null || purchase_cost===null || purchase_cost===0 || purchase_count===undefined || purchase_count===null || purchase_count < 1) {
        $scope.new_unit_sale['markup'] = null;
        $scope.new_unit_sale['target_sale_price'] = null;
      } else {
        // purchase_cost / purchase_count yields cost per sold unit
        $scope.new_unit_sale['markup'] = sale_price / (purchase_cost / purchase_count) / sale_units;
        $scope.calculatePriceToTargetMarkup($scope.new_unit_sale, true, null);
      }
      $scope.calculateMarkupColor($scope.new_unit_sale);
    }
    
    for (var i in item['size_prices']) {

      var sp = item['size_prices'][i];

      // get price per volume for wholesale
      // get price per volume for single sale
      // price_per_volume_sale / price_per_volume_wholesale = markup
      var price_per_volume_wholesale = VolUnitsService.getPricePerVolume(
        item['purchase_volume'],
        item['purchase_unit'],
        item['purchase_cost'],
        item['purchase_count'],
        $scope.volume_units_full,
        'mL');
      if (price_per_volume_wholesale <= 0) {
        sp['markup'] = null;
        sp['target_sale_price'] = null;
        $scope.calculateMarkupColor(sp);
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
        sp['markup'] = null;
        sp['target_sale_price'] = null;
        $scope.calculateMarkupColor(sp);
      } else {
        sp['markup'] = price_per_volume_sale / price_per_volume_wholesale;
        $scope.calculatePriceToTargetMarkup(sp, false, price_per_volume_wholesale);
        $scope.calculateMarkupColor(sp);
      }
    
    }
  };
  $scope.calcMarkups();

  $scope.addSaleRow = function(unit) {
    $scope.item_tmp['size_prices'].push({volume:null, unit:unit, price:null, markup:null});
  };

  $scope.removeSaleRow = function(index) {

    var sp = $scope.item_tmp['size_prices'][index];

    if (sp.volume!==null || sp.price!==null) {
      swal({
        title: "Remove Price Point?",
        text: "This will remove this serving size and price point from the beverage's sales information.  Are you sure?",
        type: "warning",
        showCancelButton: true,
        html: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Yes, remove it!",
        closeOnConfirm: true },
        function() {
          $scope.item_tmp['size_prices'].splice(index, 1);
          $scope.$apply();
      });
    } else {
      $scope.item_tmp['size_prices'].splice(index, 1);
    }

    
  };

  $scope.selectPurchaseUnit = function(unit) {
    $scope.item_tmp['purchase_unit'] = unit;
    $scope.calcMarkups();
  };

  $scope.clearPurchaseUnit = function() {
    $scope.item_tmp['purchase_unit'] = null;
    $scope.calcMarkups();
  };

  $scope.selectSizePriceUnit = function(size_price, unit) {
    size_price['unit'] = unit;
    $scope.calcMarkups();
  };

  $scope.clearSizePriceUnit = function(size_price) {
    size_price['unit'] = null;
    $scope.calcMarkups();
  };

  $scope.targetMarkupChanged = function() {
    console.log($scope.target_markup);

    var target = $scope.target_markup;
    if (target===undefined || target===null || MathService.numIsInvalidOrNegative(target)) {
      return;
    }

    $scope.calcMarkups();
  };

  $scope.closeOnSave = function() {
    $modalInstance.close(['save', $scope.item_tmp]);
  };

  $scope.save = function() {

    $scope.new_failure_msg = null;
    $scope.form_ver = {
      'error_pcost': null,
      'error_pcount': null,
      'error_pvolume': null,
      'error_punit': null,
      'error_unit_sale': null,
      'errors_sale_volume': [],
      'errors_sale_price': []
    }
    
    var all_clear = true;

    // =========================================================================
    // First make sure any empty string values are converted to null
    // =========================================================================
    if ($scope.item_tmp['purchase_volume'] === '') {
      $scope.item_tmp['purchase_volume'] = null;
    }
    if ($scope.item_tmp['purchase_cost'] === '') {
      $scope.item_tmp['purchase_cost'] = null;
    }
    if ($scope.item_tmp['purchase_count'] === '') {
      $scope.item_tmp['purchase_count'] = null;
    }

    if ($scope.new_unit_sale.value === '') {
      $scope.new_unit_sale.value = null;
    }
    for (var i in $scope.item_tmp.size_prices) {
      var sp = $scope.item_tmp.size_prices[i];
      if (sp['volume']==='') {
        sp['volume'] = null;
      }
      if (sp['price']==='') {
        sp['price'] = null;
      }
    }

    // =========================================================================
    // Perform error checking
    // =========================================================================
    // wholesale and purchase count are mandatory
    if ($scope.item_tmp['purchase_cost']===null || MathService.numIsInvalidOrNegative($scope.item_tmp['purchase_cost'])) {
      $scope.form_ver.error_pcost = true;
      all_clear = false;
    }
    if ($scope.item_tmp['purchase_count']===null || MathService.numIsInvalidOrNegative($scope.item_tmp['purchase_count']) || $scope.item_tmp['purchase_count'] < 1) {
      $scope.form_ver.error_pcount = true;
      all_clear = false;
    }

    // purchase_volume is optional but it needs to be a valid number if specified
    if ( $scope.item_tmp['purchase_volume'] !== null && MathService.numIsInvalidOrNegative($scope.item_tmp['purchase_volume']) )
    {
      $scope.form_ver.error_pvolume=true;
      all_clear = false;
    }

    // if purchase unit is not empty but purchase volume is empty, that's a volume error
    if ( $scope.item_tmp['purchase_unit']!==null && $scope.item_tmp['purchase_volume']===null ) {
      $scope.form_ver.error_pvolume=true;
      all_clear=false;
    }

    // if purchase volume is not empty but no unit, that's a unit error
    if ( $scope.item_tmp['purchase_volume']!==null && $scope.item_tmp['purchase_unit']===null ) {
      $scope.form_ver.error_punit=true;
      all_clear=false;
    }

    // check new_unit_sale, which is optional but needs to be valid
    if ($scope.new_unit_sale.value !== null && MathService.numIsInvalidOrNegative($scope.new_unit_sale.value) )
    {
      $scope.form_ver.error_unit_sale=true;
      all_clear=false;
    }

    // Collect the final list of size prices.  Careful to do the following:
    // 1. If serve_type is multi and volume and price both null, discard
    // 2. If serve_type is single, discard any size_prices not of Unit type
    var final_size_prices = []
    for (var sale_i in $scope.item_tmp['size_prices'])
    {
      var sale = $scope.item_tmp['size_prices'][sale_i];
      var serve_type = $scope.item_tmp['serve_type'];
      // if multi and both volume and price null, is empty entry; discard
      if (serve_type === 1 && sale['price'] === null && sale['volume'] === null && sale['unit'] === null) {
        continue;
      }
      // if single and not Unit entry, discard
      if (serve_type === 0 && sale['unit'] !== 'Unit') {
        continue;
      }
      final_size_prices.push(sale);
    }

    for (var sale_i in final_size_prices)
    {
      $scope.form_ver.errors_sale_volume[sale_i] = false;
      $scope.form_ver.errors_sale_price[sale_i] = false;

      var sale = final_size_prices[sale_i];
      
      if ( sale.volume === null && sale.unit===null ) {
        // missing volume AND unit
        $scope.form_ver.errors_sale_volume[sale_i] = true;
        all_clear = false;
      } else if (sale.volume !== null && MathService.numIsInvalidOrNegative(sale.volume) ) {
        // sale volume NaN
        $scope.form_ver.errors_sale_volume[sale_i] = true;
        all_clear = false;
      } else if ( sale.volume !== null && sale.unit === null ) {
        // sale volume is missing a sale unit
        $scope.form_ver.errors_sale_volume[sale_i] = true;
        all_clear = false;
      } else if ( sale.unit !== null && sale.volume === null ) {
        // sale unit is missing a sale volume
        $scope.form_ver.errors_sale_volume[sale_i] = true;
        all_clear = false;
      }
      if (sale.price !== null && MathService.numIsInvalidOrNegative(sale.price)) {
        // sale price NaN
        $scope.form_ver.errors_sale_price[sale_i] = true;
        all_clear = false;
      }
    }
    $scope.item_tmp['size_prices'] = final_size_prices;

    if (!all_clear) {
      $scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
      // if ended up with size_prices having length 0, if not single serve, push null row
      if ($scope.item_tmp['size_prices'].length === 0) {
        $scope.item_tmp['size_prices'] = [{volume:null, unit:null, price:null}];
      }
      return;
    }

    // the unit sale is a special entry we need to push into size_prices,
    // with volume 1, unit "Unit", and price of new_unit_sale.  Note we do this
    // after there are no form validation errors and are ready to commit.
    // Also note that we add this even if new_unit_sale.value is null,
    // because this item should be displayed to have be sold in 1 unit
    //
    // Should always add for single serve
    if ($scope.item_tmp['serve_type'] === 0 || $scope.item_tmp['container_type'] !== "Keg") {
      // unshift places the entry at head of array
      $scope.item_tmp['size_prices'].unshift({'volume':1, 'unit':'Unit', 'price':$scope.new_unit_sale.value})
    }

    // this is an EDIT operation
    // Find any diffs between the original and the modified object.
    // Instead of doing a comprehensive generic comparison, we rely on
    // knowing the beverage object's structure to do comparisons (e.g.,
    // the fact that size_prices is an array of objects)
    var changedKeys = [];     // store which keys changed
    var valid_keys = ['purchase_cost', 'purchase_volume', 'purchase_unit', 'purchase_count', 'size_prices'];
    for (var key in $scope.item_tmp) {
      if (valid_keys.indexOf(key) < 0) {
        continue;
      }
      if ($scope.item_tmp.hasOwnProperty(key)) {
        // handle known special cases such as size_prices
        if (key==='size_prices') {
          var osp = $scope.item.size_prices;
          var sp = $scope.item_tmp.size_prices;
          if ( (osp===null && sp!==null) || (osp!==null&&sp===null) ) {
            changedKeys.push(key);
            continue;
          }

          if ($scope.item.size_prices.length !== $scope.item_tmp.size_prices.length)
          {
            changedKeys.push(key);
            continue;
          }

          for (var i in $scope.item.size_prices) {
            var osp = $scope.item.size_prices[i]
            var sp = $scope.item_tmp.size_prices[i];
            if (osp.price != sp.price || osp.unit != sp.unit || osp.volume != sp.volume) {
              changedKeys.push(key);
              continue;
            }
          }
        }
        else if ($scope.item[key] !== $scope.item_tmp[key]) {
          changedKeys.push(key);
        }
      }
    }

    if (changedKeys.length == 0) {
      $scope.cancel();
      return;
    }

    console.log(changedKeys);

    // now put the values of the *changed* keys to the server
    var putObj = {};
    for (var i in changedKeys) {
      var key = changedKeys[i];
      putObj[key] = $scope.item_tmp[key];
    }
    putObj.id = $scope.item_tmp.id;

    var result = BeveragesService.put(putObj, changedKeys);
    result.then(
    function(payload) {
      var new_bev_id = payload.data['id'];
      $scope.item_tmp.id = new_bev_id;

      for (var key in $scope.item_tmp) {
        if ($scope.item.hasOwnProperty(key)) {
          $scope.item[key] = $scope.item_tmp[key];
        }
      }

      $modalInstance.close(['save', $scope.item]);

    },
    function(errorPayload) {
      ; // do nothing for now
    });

  };

  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };


});
