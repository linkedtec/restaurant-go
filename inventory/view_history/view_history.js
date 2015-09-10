'use strict';

angular.module('myApp.viewHistory', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewHistory', {
    templateUrl: 'view_history/view_history.html',
    controller: 'ViewHistoryCtrl'
  });
}])

.controller('ViewHistoryCtrl', function($scope, $http, $timeout, DateService) { 

  $scope.use_modes = ['History Tables', 'Graphs'];
  $scope.use_mode = 0;

  $scope.sort_types = ["All Inventory", "By Location", "Beverage Type", "Individual Items"];
  $scope.sort_type = $scope.sort_types[0];

  $scope.initDate = function() {
    var today = new Date();
    $scope.start_date = new Date(today.setDate(today.getDate() - 30));
    $scope.end_date = new Date();
    $scope.end_date.setHours(23,59,59);
  };
  $scope.initDate();

  $scope.invData = {
    'all_sum' : [],
    'all_itemized' : [],
    'loc_sum' : [],
    'loc_itemized' : [],
    'type_sum' : [],
    'type_itemized' : [],
    'items' : []
  };

  $scope.display_items = [];
  $scope.all_items = [];
  $scope.added_items = [];

  $scope.selectUseMode = function(use_mode) {
    if (use_mode === $scope.use_modes[0]) {
      $scope.use_mode = 0;
    } else {
      $scope.use_mode = 1;
    }
    // call selectSortType to refresh data and graphs, if needed
    $scope.selectSortType($scope.sort_type);
  };

  $scope.selectSortType = function( type ) {
    $scope.sort_type = type;
    $scope.getInvData();
  };

  $scope.getInvData = function() {

    console.log("get inv data");
    console.log($scope.startDateLocal());
    console.log($scope.endDateLocal());

    if ($scope.sort_type === $scope.sort_types[0]) {
      if ($scope.use_mode === 0) {
        $scope.getAllInventoryItemized();
      } else {
        $scope.getAllInventorySum();
      }

    } else if ($scope.sort_type === $scope.sort_types[1]) {

      if ($scope.use_mode === 0) {
        $scope.getLocationsItemized();
      } else {
        $scope.getLocationsSum();
      }
      

    } else if ($scope.sort_type === $scope.sort_types[2]) {
      if ($scope.use_mode === 0) {
        $scope.getBevTypesItemized();
      } else {
        $scope.getBevTypesSum();
      }
    } else if ($scope.sort_type === $scope.sort_types[3]) {
      if ($scope.all_items.length === 0 && $scope.added_items.length === 0) {
        $scope.getAllBeverageNames();
      }

      $scope.refreshItemsData();
      
      $scope.plotInvData();
    }
  };

  /*
     The server returns individual items data ordered first order by 
     beverage id.  To display individual items data in table, need to
     reorganize data into organized first order by date.
  */
  $scope.constructItemsByDate = function() {
    var items_by_date = {};

    // item_histories = {
    //   product: product name
    //   histories: [{update: timestamp, quantity:value, inventory:value}]
    // }

    for (var item_i in $scope.invData['items']) {
      var item_history = $scope.invData['items'][item_i];
      var product = item_history.product;
      var histories = item_history.histories;
      if (histories === undefined || histories === null) {
        histories = [];
      }
      for (var his_i in histories) {
        var history = histories[his_i];
        var update = history.update;
        var inventory = history.inventory;
        var wholesale = history.wholesale;
        var deposit = history.deposit;
        var quantity = history.quantity;
        // if update is not a key in items_by_date, add it as a key
        // insert {product, quantity, inventory} into items_by_date for key
        if (!(update in items_by_date)) {
          items_by_date[update] = [];
        }
        items_by_date[update].push({
          'product': product,
          'quantity': quantity,
          'wholesale': wholesale,
          'deposit': deposit,
          'inventory': inventory
        });
      }
    }

    var items_arr = [];
    for (var date in items_by_date) {
      var date_item = items_by_date[date];
      // gather sum of inventory in date_item
      var inv_sum = 0;
      for (var j in date_item) {
        var item = date_item[j];
        inv_sum += item['inventory'];
      }
      var pretty_tokens = date.split(" ");  
      var pretty_date = pretty_tokens[0] + ", " + pretty_tokens[1] + " " + pretty_tokens[2] + " " + pretty_tokens[3];
      items_arr.push(
      {
        'update': date,
        'pretty_date': pretty_date,
        'date_inv': date_item,
        'inv_sum': inv_sum
      });
    }

    console.log("about to sort");
    console.log(items_arr);
    items_arr.sort(function(a,b) {
      return new Date(b.update) - new Date(a.update);
    });

    $scope.invData['items_by_date'] = items_arr;
    $scope.display_items = items_arr;

  }

  $scope.plotInvData = function() {
    if ($scope.use_mode !== 1) {
      return;
    }
    d3.select("#d3viz").selectAll("*").remove();
    if ($scope.sort_type === $scope.sort_types[0]) {
      $scope.plotAll();
    } else if ($scope.sort_type === $scope.sort_types[1]) {
      $scope.plotLocations("loc");
    } else if ($scope.sort_type === $scope.sort_types[2]) {
      $scope.plotLocations("type");
    } else {
      $scope.plotIndividuals();
    }
  };

  $scope.getAllBeverageNames = function() {
    $http.get('/inv', {
      params: { type: 'names' }
    }).
    success(function(data, status, headers, config) {

      $scope.all_items = data;

      $scope.all_items.sort(function(a, b) {
        var keyA = a['product'];
        var keyB = b['product'];
        return keyA.localeCompare(keyB);
      });
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.refreshItemsData = function() {

    var all_items = [];
    for (var i in $scope.added_items) {
      all_items.push($scope.added_items[i]);
    }
    $scope.getItemsData(all_items);
    if ($scope.use_mode === 0) {
      // for displaying itemized inventory in the table need to reorganize
      // invData.items into an array sorted by date
      $scope.constructItemsByDate();
    }
  }

  $scope.addItem = function(item) {
    for (var i in $scope.all_items) {
      if (item == $scope.all_items[i]) {
        $scope.all_items.splice(i, 1);
        break;
      }
    }
    $scope.added_items.push(item);

    $scope.getItemsData([item]);

  };

  $scope.removeAddedItems = function() {
    for (var i in $scope.added_items) {
      $scope.all_items.push($scope.added_items[i]);
    }
    $scope.added_items = [];
    $scope.all_items.sort(function(a, b) {
      var keyA = a['product'];
      var keyB = b['product'];
      return keyA.localeCompare(keyB);
    });

  };

  $scope.removeAddedItem = function(item) {
    for (var i in $scope.added_items) {
      if (item == $scope.added_items[i]) {
        $scope.added_items.splice(i, 1);
        break;
      }
    }
    for (var i in $scope.invData['items']) {
      var item_history = $scope.invData['items'][i];
      if (item_history.product === item.product) {
        $scope.invData['items'].splice(i, 1);
        break;
      }
    }
    $scope.all_items.push(item);
    $scope.all_items.sort(function(a, b) {
      var keyA = a['product'];
      var keyB = b['product'];
      return keyA.localeCompare(keyB);
    });

    if ($scope.use_mode===0) {
      $scope.constructItemsByDate();
    } else {
      // we call timeout so DOM can refresh the added beverage buttons before
      // d3 tries to assign colors to them.  This is a synchronization call.
      $timeout((function() {
        $scope.plotInvData();
      }), 0);
    }
    
  };

  $scope.getLocalD3DateFromUTCTimeStamp = function(timestamp) {

    var parseDate = d3.time.format("%Y-%m-%d").parse;
    var date_str = timestamp.substring(0,timestamp.indexOf('T'));
    return parseDate(date_str);
  };

  $scope.startDateLocal = function() {
    return $scope.start_date;
  };

  $scope.endDateLocal = function() {
    return $scope.end_date;
  };

  $scope.exportSpreadsheet = function() {

    console.log("export spreadsheet");

    var history_type;
    if ($scope.sort_type === $scope.sort_types[0]) {
      history_type = "all_itemized";
    } else if ($scope.sort_type === $scope.sort_types[1]) {
      history_type = "loc_itemized";
    } else if ($scope.sort_type === $scope.sort_types[2]) {
      history_type = "type_itemized";
    } else {
      history_type = "items";
    }

    var all_ids = [];
    for (var i in $scope.added_items) {
      all_ids.push($scope.added_items[i]['id']);
    }

    $http.get('/inv/history', {
      params: { 
        type: history_type,
        ids: all_ids,
        start_date: $scope.startDateLocal(),
        end_date: $scope.endDateLocal(),
        tz_offset: DateService.timeZoneOffset(),
        export:'xlsx' }
    }).
    success(function(data, status, headers, config) {
      console.log(data);
      var URL = data['url'];
      // create an iframe to download the file at the url
      var iframe = document.createElement("iframe");
      iframe.setAttribute("src", URL);
      iframe.setAttribute("style", "display: none");
      document.body.appendChild(iframe);
    }).
    error(function(data, status, headers, config) {

    });

  };

  $scope.getAllInventorySum = function() {
    $http.get('/inv/history', {
      params: { 
        type: 'all_sum',
        start_date: $scope.startDateLocal(),
        end_date: $scope.endDateLocal(),
        tz_offset: DateService.timeZoneOffset()
      }
    }).
    success(function(data, status, headers, config) {
      console.log(data);

      $scope.invData['all_sum'] = [];

      for (var date_i in data)
      {
        var update = data[date_i].update;

        $scope.invData['all_sum'].push({
          'update':$scope.getLocalD3DateFromUTCTimeStamp(update),
          'inventory':data[date_i].inventory});
      }
      $scope.invData['all_sum'].sort(function(a, b) {
        return a.update - b.update;
      });
      //console.log($scope.invData['all_sum']);

      $scope.plotInvData();

    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.getAllInventoryItemized = function() {

    $http.get('/inv/history', {
      params: { 
        type: 'all_itemized',
        start_date: $scope.startDateLocal(),
        end_date: $scope.endDateLocal(),
        tz_offset: DateService.timeZoneOffset()
      }
    }).
    success(function(data, status, headers, config) {
      console.log(data);

      $scope.invData['all_itemized'] = [];

      for (var date_i in data) {
        var date_obj = data[date_i];
        var date_key = date_obj['update'];
        var pretty_date = DateService.getPrettyDate(date_key, true);

        var inv_sum = 0;
        for (var history_i in date_obj['histories']) {
          var history = date_obj['histories'][history_i];
          inv_sum += history['inventory'];
        }
        $scope.invData['all_itemized'].push(
          {'date': date_key,
          'pretty_date': pretty_date,
          'date_inv': date_obj['histories'],
          'inv_sum': inv_sum
        });
      }

      if ($scope.invData['all_itemized'].length === 0) {
        $scope.invData['all_itemized'] = null;
      };

      $scope.display_items = $scope.invData['all_itemized'];
      console.log($scope.display_items);
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.getLocationsSum = function() {
    $http.get('/inv/history', {
      params: { 
        type: 'loc_sum',
        start_date: $scope.startDateLocal(),
        end_date: $scope.endDateLocal(),
        tz_offset: DateService.timeZoneOffset()
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      $scope.invData['loc_sum'] = [];

      for (var loc_i in data)
      {
        var loc_name = data[loc_i].location;
        var histories = data[loc_i].histories;
        if (histories == null) {
          continue;
        }

        var loc_histories = {
          "location": loc_name,
          "histories": []
        }

        for (var his_i in histories) {
          var update = histories[his_i].update;

          loc_histories.histories.push({
            'update':$scope.getLocalD3DateFromUTCTimeStamp(update),
            'inventory':histories[his_i].inventory});
          loc_histories.histories.sort(function(a,b) {
            return a.update - b.update;
          });
        }

        $scope.invData['loc_sum'].push(loc_histories);
      }
      //console.log($scope.invData['loc_sum']);

      $scope.plotInvData();
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.getLocationsItemized = function() {
    $http.get('/inv/history', {
      params: { 
        type: 'loc_itemized',
        start_date: $scope.startDateLocal(),
        end_date: $scope.endDateLocal(),
        tz_offset: DateService.timeZoneOffset()
      }
    }).
    success(function(data, status, headers, config) {
      // We want to have the first order key be dates, and the second order
      // key be locations.  This way the user can view single location inventory
      // by date if they single out a single location with location filter
      // buttons (XXX future implementation), whereas the other ordering
      // would not have that possibility
      console.log(data);

      $scope.invData['loc_itemized'] = data;

      for (var date_i in data) {
        var date_entry = data[date_i];
        var date_key = date_entry["update"];
        var pretty_date = DateService.getPrettyDate(date_key, true);

        var inv_sum = 0;
        for (var loc_i in data[date_i]['loc_histories']) {
          var loc_sum = 0;
          for (var item_i in data[date_i]['loc_histories'][loc_i]['histories']) {
            loc_sum += data[date_i]['loc_histories'][loc_i]['histories'][item_i]['inventory'];
          }
          data[date_i]['loc_histories'][loc_i]['inv_sum'] = loc_sum;
          inv_sum += loc_sum;
        }

        date_entry["pretty_date"] = pretty_date;
        date_entry["inv_sum"] = inv_sum;
      }

      $scope.display_items = $scope.invData['loc_itemized'];
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.getBevTypesSum = function() {
    $http.get('/inv/history', {
      params: { 
        type: 'type_sum',
        start_date: $scope.startDateLocal(),
        end_date: $scope.endDateLocal(),
        tz_offset: DateService.timeZoneOffset()
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      $scope.invData['type_sum'] = [];

      for (var type_i in data)
      {
        var type_name = data[type_i].location;
        var histories = data[type_i].histories;
        if (histories == null) {
          continue;
        }

        var type_histories = {
          "type": type_name,
          "histories": []
        }

        for (var his_i in histories) {
          var update = histories[his_i].update;

          type_histories.histories.push({
            'update':$scope.getLocalD3DateFromUTCTimeStamp(update),
            'inventory':histories[his_i].inventory});
          type_histories.histories.sort(function(a,b) {
            return a.update - b.update;
          });
        }

        $scope.invData['type_sum'].push(type_histories);
      }
      //console.log($scope.invData['type_sum']);

      $scope.plotInvData();
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.getBevTypesItemized = function() {
    $http.get('/inv/history', {
      params: { 
        type: 'type_itemized',
        start_date: $scope.startDateLocal(),
        end_date: $scope.endDateLocal(),
        tz_offset: DateService.timeZoneOffset()
      }
    }).
    success(function(data, status, headers, config) {
      // We want to have the first order key be dates, and the second order
      // key be locations.  This way the user can view single location inventory
      // by date if they single out a single location with location filter
      // buttons (XXX future implementation), whereas the other ordering
      // would not have that possibility
      console.log(data);

      $scope.invData['type_itemized'] = data;

      for (var date_i in data) {
        var date_entry = data[date_i];
        var date_key = date_entry["update"];
        var pretty_date = DateService.getPrettyDate(date_key, true);

        // Note, although second order key is 'loc_histories', we're piggy
        // backing off the loc data struct and using it as 'type'
        var inv_sum = 0;
        for (var type_i in data[date_i]['loc_histories']) {
          var type_sum = 0;
          for (var item_i in data[date_i]['loc_histories'][type_i]['histories']) {
            type_sum += data[date_i]['loc_histories'][type_i]['histories'][item_i]['inventory'];
          }
          data[date_i]['loc_histories'][type_i]['inv_sum'] = type_sum;
          inv_sum += type_sum;
        }

        date_entry["pretty_date"] = pretty_date;
        date_entry["inv_sum"] = inv_sum;
      }

      $scope.display_items = $scope.invData['type_itemized'];
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.getItemsData = function(items) {
    
    var all_ids = [];
    var all_products = [];
    for (var i in items) {
      all_ids.push(items[i]['id']);
      all_products.push(items[i]['product']);
    }

    if (all_ids.length === 0) {
      return;
    }

    $http.get('/inv/history', {
      params: { 
        type: 'items',
        ids: all_ids,
        start_date: $scope.startDateLocal(),
        end_date: $scope.endDateLocal(),
        tz_offset: DateService.timeZoneOffset()
      }
    }).
    success(function(data, status, headers, config) {
      console.log(data);

      // first remove existing product entries of the products we just
      // queried from invData.items
      var new_items = [];
      for (var i in $scope.invData['items']) {
        var item = $scope.invData['items'][i];
        if (all_products.indexOf(item['product']) < 0) {
          new_items.push(item);
        }
      }
      $scope.invData['items'] = new_items;
      console.log("new inv data");
      console.log($scope.invData['items']);

      for (var i in data) {
        item = data[i];
        for (var h_i in item.histories) {
          data[i].histories[h_i]['update'] = $scope.getLocalD3DateFromUTCTimeStamp(item.histories[h_i]['update']);
        }
        $scope.invData['items'].push(data[i]);
      }

      $scope.display_items = $scope.invData['items'];

      if ($scope.use_mode===0) {
        console.log("about to construct by date");
        console.log($scope.display_items);
        $scope.constructItemsByDate();
      } else {
        $scope.plotInvData();
      }
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.plotIndividuals = function() {

    var margin = {top:20,right:80,bottom:30,left:50};
    var width = 800 - margin.left - margin.right;
    var height = 500 - margin.top - margin.bottom;

    var formatValue = d3.format(",.2f");
    var formatCurrency = function(d) { return "$" + formatValue(d); };

    var x = d3.time.scale().range([0, width]);
    var y = d3.scale.linear().range([height, 0]);

    var color = d3.scale.category10();
    if ($scope.invData['items'].length > 10) {
      color = d3.scale.category20();
    }

    var xAxis = d3.svg.axis().scale(x)
      .orient("bottom")
      .tickFormat(d3.time.format("%b %d"))
      .ticks(d3.time.days, 3);

    var yAxis = d3.svg.axis().scale(y).orient("left");

    var line = d3.svg.line()
        .x(function(d) { return x(d.update); })
        .y(function(d) { return y(d.inventory); });

    var svg = d3.select('#d3viz')
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var min_time = null, max_time = null;
    var max_inv_sum = 0;
    for (var i in $scope.invData['items']) {
      var loc_histories = $scope.invData['items'][i].histories;
      for (var j in loc_histories) {
        var his = loc_histories[j];
        if (min_time === null) {
          min_time = his.update;
        } else if (min_time > his.update) {
          min_time = his.update;
        }
        if (max_time === null) {
          max_time = his.update;
        } else if (max_time < his.update) {
          max_time = his.update;
        }
        if (max_inv_sum < his.inventory) {
          max_inv_sum = his.inventory;
        }
      }
    }
    x.domain([min_time, max_time]);
    y.domain([0, max_inv_sum*1.1]);

    svg.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0,"+height+")")
      .call(xAxis);

    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis)
      .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text("Inventory ($)");

    var focus = svg.append("g")
      .attr("class", "focus")
      .style("display", "none");

    focus.append("circle")
      .attr("r", 6);

    focus.append("text")
      .attr("id", "focus_inv")
      .attr("x", 4)
      .attr("y", -20)
      .attr("dy", ".35em")
      .style("fill", "#33aa00");

    focus.append("text")
      .attr("id", "focus_date")
      .attr("x", 4)
      .attr("y", -40)
      .attr("dy", ".35em")
      .style("fill", "#aaaaaa");

    for (var item_i in $scope.invData['items']) {
      var d = $scope.invData['items'][item_i].histories;
      var product = $scope.invData['items'][item_i].product;

      if (d===undefined || d === null || d.length===0) {
        var button_id = "#a_item_" + item_i.toString();
        d3.select(button_id)
          .style("background-color","#cccccc");
        continue;
      }
      //console.log(d);
      svg.append("path")
        .datum(d)
        .attr("d", line)
        .attr("stroke", color(item_i))
        .attr("stroke-opacity", 0.4)
        .attr("fill", "none");

      svg.selectAll("dot")
          .data(d)
        .enter()
          .append("circle")
            .attr("r", 4)
            .attr("cx", function(d) { return x(d.update); })
            .attr("cy", function(d) { return y(d.inventory); })
            .attr("fill", color(item_i))
      svg.selectAll("dot_hover")
          .data(d)
        .enter()
          .append("circle")
            .attr("r", 10)
            .attr("cx", function(d) { return x(d.update); })
            .attr("cy", function(d) { return y(d.inventory); })
            .attr("fill", "transparent")
            .on("mouseover", mouseover)
            .on("mouseout", mouseout);

      var button_id = "#a_item_" + item_i.toString();
      $(button_id).ready(function() {
        d3.selectAll(button_id).transition()
          .style("background-color",color(item_i));
      });
      //d3.selectAll(button_id)
      //  .style("background-color",color(item_i));
      console.log(button_id);
      console.log(color(item_i));

      svg.append("text")
        .attr("x", x(d[d.length-1].update) + 4 )
        .attr("y", y(d[d.length-1].inventory) - 10 )
        .attr("dy", ".35em")
        .attr("font-size", "0.8em")
        .text($scope.invData['items'][item_i].product)
        .style("fill", color(item_i));
    }
    function mouseover(d) {
      focus.attr("transform", "translate(" + x(d.update) + "," + y(d.inventory) + ")");
      focus.select("#focus_inv").text(formatCurrency(d.inventory));
      focus.select("#focus_date").text(d3.time.format("%b %d")(d.update));
      focus.style("display", null);
    }

    function mouseout(d) {
      focus.style("display", "none");
    }
  };

  $scope.plotLocations = function(loc_or_type) {
    var margin = {top:20,right:80,bottom:30,left:50};
    var width = 800 - margin.left - margin.right;
    var height = 500 - margin.top - margin.bottom;

    var formatValue = d3.format(",.2f");
    var formatCurrency = function(d) { return "$" + formatValue(d); };

    var x = d3.time.scale().range([0, width]);
    var y = d3.scale.linear().range([height, 0]);

    var data_name = 'loc_sum';
    var key_name = 'location';
    if (loc_or_type === 'type') {
      data_name = 'type_sum';
      key_name = 'type';
    }

    var color = d3.scale.category10();
    if ($scope.invData[data_name].length > 10) {
      color = d3.scale.category20();
    }

    var xAxis = d3.svg.axis().scale(x)
      .orient("bottom")
      .tickFormat(d3.time.format("%b %d"))
      .ticks(d3.time.days, 3);

    var yAxis = d3.svg.axis().scale(y).orient("left");

    var line = d3.svg.line()
        .x(function(d) { return x(d.update); })
        .y(function(d) { return y(d.inventory); });

    var svg = d3.select('#d3viz')
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var min_time = null, max_time = null;
    var max_inv_sum = 0;
    for (var i in $scope.invData[data_name]) {
      var loc_histories = $scope.invData[data_name][i].histories;
      for (var j in loc_histories) {
        var his = loc_histories[j];
        if (min_time === null) {
          min_time = his.update;
        } else if (min_time > his.update) {
          min_time = his.update;
        }
        if (max_time === null) {
          max_time = his.update;
        } else if (max_time < his.update) {
          max_time = his.update;
        }
        if (max_inv_sum < his.inventory) {
          max_inv_sum = his.inventory;
        }
      }
    }
    x.domain([min_time, max_time]);
    y.domain([0, max_inv_sum*1.1]);
      
    /*
    var all_locs = [];
    for (var i in $scope.invData['loc_sum']) {
      all_locs.push($scope.invData['loc_sum'][i].location);
    }
    console.log(all_locs);
    color.domain(d3.keys(all_locs).filter(function(key) { return key !== "date"; }));
    */

    svg.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0,"+height+")")
      .call(xAxis);

    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis)
      .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text("Inventory ($)");

    var focus = svg.append("g")
      .attr("class", "focus")
      .style("display", "none");

    focus.append("circle")
      .attr("r", 6);

    focus.append("text")
      .attr("id", "focus_inv")
      .attr("x", 4)
      .attr("y", -20)
      .attr("dy", ".35em")
      .style("fill", "#33aa00");

    focus.append("text")
      .attr("id", "focus_date")
      .attr("x", 4)
      .attr("y", -40)
      .attr("dy", ".35em")
      .style("fill", "#aaaaaa");

    for (var loc_i in $scope.invData[data_name]) {
      var d = $scope.invData[data_name][loc_i].histories;
      //console.log(d);
      svg.append("path")
        .datum(d)
        .attr("d", line)
        .attr("stroke", color(loc_i))
        .attr("stroke-opacity", 0.4)
        .attr("fill", "none");

      svg.selectAll("dot")
          .data(d)
        .enter()
          .append("circle")
            .attr("r", 4)
            .attr("cx", function(d) { return x(d.update); })
            .attr("cy", function(d) { return y(d.inventory); })
            .attr("fill", color(loc_i))
      svg.selectAll("dot_hover")
          .data(d)
        .enter()
          .append("circle")
            .attr("r", 10)
            .attr("cx", function(d) { return x(d.update); })
            .attr("cy", function(d) { return y(d.inventory); })
            .attr("fill", "transparent")
            .on("mouseover", mouseover)
            .on("mouseout", mouseout);

      svg.append("text")
        .attr("x", x(d[d.length-1].update) + 4 )
        .attr("y", y(d[d.length-1].inventory) - 10 )
        .attr("dy", ".35em")
        .attr("font-size", "0.8em")
        .text($scope.invData[data_name][loc_i][key_name])
        .style("fill", color(loc_i));
    }

    function mouseover(d) {
      focus.attr("transform", "translate(" + x(d.update) + "," + y(d.inventory) + ")");
      focus.select("#focus_inv").text(formatCurrency(d.inventory));
      focus.select("#focus_date").text(d3.time.format("%b %d")(d.update));
      focus.style("display", null);
    }

    function mouseout(d) {
      focus.style("display", "none");
    }
  };

  $scope.plotAll = function() {

    var margin = {top:20,right:80,bottom:30,left:50};
    var width = 800 - margin.left - margin.right;
    var height = 500 - margin.top - margin.bottom;

    //var bisectDate = d3.bisector(function(d) { return d.update; }).left;
    var formatValue = d3.format(",.2f");
    var formatCurrency = function(d) { return "$" + formatValue(d); };

    var x = d3.time.scale().range([0, width]);
    var y = d3.scale.linear().range([height, 0]);

    var xAxis = d3.svg.axis().scale(x)
      .orient("bottom")
      .tickFormat(d3.time.format("%b %d"))
      .ticks(d3.time.days, 3);

    var yAxis = d3.svg.axis().scale(y).orient("left");

    var line = d3.svg.line()
        .x(function(d) { return x(d.update); })
        .y(function(d) { return y(d.inventory); });

    var svg = d3.select('#d3viz')
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    x.domain(d3.extent($scope.invData['all_sum'], function(d) {return d.update; }));
    y.domain(d3.extent($scope.invData['all_sum'], function(d) {return d.inventory * 1.1}));

    svg.append("path")
      .datum($scope.invData['all_sum'])
      .attr("class", "line")
      .attr("d", line);

    var focus = svg.append("g")
      .attr("class", "focus")
      .style("display", "none");

    focus.append("circle")
      .attr("r", 6);

    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0,"+height+")")
        .call(xAxis);

    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis)
      .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text("Inventory ($)");

    svg.selectAll("dot")
        .data($scope.invData['all_sum'])
      .enter().append("circle")
        .attr("r", 4)
        .attr("cx", function(d) { return x(d.update); })
        .attr("cy", function(d) { return y(d.inventory); })
        .attr("fill", "#44bb99");
    svg.selectAll("dot_hover")
        .data($scope.invData['all_sum'])
      .enter()
        .append("circle")
          .attr("r", 20)
          .attr("cx", function(d) { return x(d.update); })
          .attr("cy", function(d) { return y(d.inventory); })
          .attr("fill", "transparent")
          .on("mouseover", mouseover )
          .on("mouseout", function() { focus.style("display", "none"); });

    function mouseover(d) {
      focus.attr("transform", "translate(" + x(d.update) + "," + y(d.inventory) + ")");
      focus.select("#focus_inv").text(formatCurrency(d.inventory));
      focus.select("#focus_date").text(d3.time.format("%b %d")(d.update));
      focus.style("display", null);
    }

    focus.append("text")
      .attr("id", "focus_date")
      .attr("x", 4)
      .attr("y", -40)
      .attr("dy", ".35em")
      .style("fill", "#aaaaaa");

    focus.append("text")
      .attr("id", "focus_inv")
      .attr("x", 4)
      .attr("y", -20)
      .attr("dy", ".35em")
      .style("fill", "#33aa00");

    /*
    function mousemove() {
      var x0 = x.invert(d3.mouse(this)[0]);
      var i = bisectDate($scope.invData, x0, 1);
      var d0 = $scope.invData[i - 1];
      var d1 = $scope.invData[i];
      var d = x0 - d0.update > d1.update - x0 ? d1 : d0;
      focus.attr("transform", "translate(" + x(d.update) + "," + y(d.inventory) + ")");
      focus.select("#focus_inv").text(formatCurrency(d.inventory));
      focus.select("#focus_date").text(d3.time.format("%b %d")(d.update));
    }
  */
  };

  //$scope.getLocationsSum();

  //=====================================

  $scope.startDateChanged = function() {
    console.log('A');
    $scope.selectSortType($scope.sort_type);
  };

  $scope.endDateChanged = function() {
    $scope.selectSortType($scope.sort_type);
  };

  $scope.selectUseMode($scope.use_modes[0]);

});



