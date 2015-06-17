'use strict';

angular.module('myApp.viewHistory', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewHistory', {
    templateUrl: 'view_history/view_history.html',
    controller: 'ViewHistoryCtrl'
  });
}])

.controller('ViewHistoryCtrl', function($scope, $http, $timeout) {

  $scope.use_modes = ['Graphs', 'History Tables'];
  $scope.use_mode = 0;

  $scope.sort_types = ["All Inventory", "By Location", "Individual Items"/*", By Beverage Type"*/ ];
  $scope.sort_type = $scope.sort_types[0];

  $scope.invData = {
    'all_sum' : [],
    'all_itemized' : [],
    'loc_sum' : [],
    'loc_itemized' : [],
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

    if ($scope.sort_type === $scope.sort_types[0]) {
      if ($scope.use_mode === 0) {
        $scope.getAllInventorySum();
      } else {
        $scope.getAllInventoryItemized();
      }

    } else if ($scope.sort_type === $scope.sort_types[1]) {

      if ($scope.use_mode === 0) {
        $scope.getLocationsSum();
      } else {
        $scope.getLocationsItemized();
      }
      

    } else {
      if ($scope.all_items.length === 0 && $scope.added_items.length === 0) {
        $scope.getAllBeverageNames();
      }

      $scope.refreshItemsData();
      
      $scope.plotInvData();
    }
  };

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
        var quantity = history.quantity;
        // if update is not a key in items_by_date, add it as a key
        // insert {product, quantity, inventory} into items_by_date for key
        if (!(update in items_by_date)) {
          items_by_date[update] = [];
        }
        items_by_date[update].push({
          'product': product,
          'quantity': quantity,
          'inventory': inventory
        });
      }
    }

    var items_arr = [];
    for (var date in items_by_date) {
      var date_item = items_by_date[date];
      var pretty_tokens = date.split(" ");  
      var pretty_date = pretty_tokens[0] + ", " + pretty_tokens[1] + " " + pretty_tokens[2] + " " + pretty_tokens[3];
      items_arr.push(
      {
        'update': date,
        'pretty_date': pretty_date,
        'date_inv': date_item
      });
    }

    console.log("about to sort");
    console.log(items_arr);
    items_arr.sort(function(a,b) {
      return new Date(a.update) - new Date(b.update);
    });

    $scope.invData['items_by_date'] = items_arr;
    $scope.display_items = items_arr;

  }

  $scope.plotInvData = function() {
    if ($scope.use_mode !== 0) {
      return;
    }
    d3.select("#d3viz").selectAll("*").remove();
    if ($scope.sort_type === $scope.sort_types[0]) {
      $scope.plotAll();
    } else if ($scope.sort_type === $scope.sort_types[1]) {
      $scope.plotLocations();
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
    if ($scope.use_mode === 1) {
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

    if ($scope.use_mode===1) {
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

  $scope.getItemsData = function(items) {
    
    var all_ids = [];
    var all_products = [];
    for (var i in items) {
      all_ids.push(items[i]['id']);
      all_products.push(items[i]['product']);
    }

    $http.get('/inv/history', {
      params: { 
        type: 'items',
        ids: all_ids,
        start_date: $scope.startDateUTC(),
        end_date: $scope.endDateUTC() }
    }).
    success(function(data, status, headers, config) {
      console.log(data);

      // first remove existing product entry from invData.items
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

      /*
      var item_histories = {
        "product": item.product,
        "histories": []
      }

      var histories = [];

      if (data !== null) {
        histories = data;
      }

      for (var his_i in histories) {
        var update = histories[his_i].update;
        
        item_histories.histories.push({
          'date':$scope.getLocalD3DateFromUTCTimeStamp(update),
          'quantity':histories[his_i].quantity,
          'inventory':histories[his_i].inventory});
        item_histories.histories.sort(function(a,b) {
          return a.date - b.date;
        });
      }
      $scope.invData['items'].push(item_histories);
      */
      
      $scope.display_items = $scope.invData['items'];

      if ($scope.use_mode===1) {
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

  $scope.startDateUTC = function() {
    return new Date(
      $scope.dates.start.getUTCFullYear(), 
      $scope.dates.start.getUTCMonth(), 
      $scope.dates.start.getUTCDate());
  };

  $scope.endDateUTC = function() {
    return new Date(
      $scope.dates.end.getUTCFullYear(),
      $scope.dates.end.getUTCMonth(),
      $scope.dates.end.getUTCDate());
  };

  $scope.getAllInventoryItemized = function() {

    $http.get('/inv/history', {
      params: { 
        type: 'all_itemized',
        start_date: $scope.startDateUTC(),
        end_date: $scope.endDateUTC() }
    }).
    success(function(data, status, headers, config) {
      console.log(data);

      $scope.invData['all_itemized'] = [];
      // data is an object whose keys are the inventory date, and whose
      // values are an array of objects with {id, inventory, product, quantity}
      for (var date_key in data) {

        var date_str = date_key.split(" ")[0];
        var date_tokens = date_str.split("-");

        date_str = new Date(parseInt(date_tokens[0]), parseInt(date_tokens[1])-1, parseInt(date_tokens[2])).toString();
        var pretty_tokens = date_str.split(" ");
        
        var pretty_date = pretty_tokens[0] + ", " + pretty_tokens[1] + " " + pretty_tokens[2] + " " + pretty_tokens[3];

        $scope.invData['all_itemized'].push(
          {'date': date_key,
          'pretty_date': pretty_date,
          'date_inv': data[date_key]
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
  }

  $scope.getAllInventorySum = function() {
    $http.get('/inv/history', {
      params: { 
        type: 'all_sum',
        start_date: $scope.startDateUTC(),
        end_date: $scope.endDateUTC()
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

  $scope.getLocationsSum = function() {
    $http.get('/inv/history', {
      params: { 
        type: 'loc_sum',
        start_date: $scope.startDateUTC(),
        end_date: $scope.endDateUTC()
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
        start_date: $scope.startDateUTC(),
        end_date: $scope.endDateUTC()
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
        var date = date_entry["update"];

        var date_tokens = date.split("-");

        var date_str = new Date(parseInt(date_tokens[0]), parseInt(date_tokens[1])-1, parseInt(date_tokens[2])).toString();
        var pretty_tokens = date_str.split(" ");
        
        var pretty_date = pretty_tokens[0] + ", " + pretty_tokens[1] + " " + pretty_tokens[2] + " " + pretty_tokens[3];

        date_entry["pretty_date"] = pretty_date;
      }

      /*
      for (var date_i in data)
      {
        var date_entry = data[date_i];
        var date_locs = {
          "update": date_entry.update,
          "loc_histories": []
        }

        var loc_histories = [];
        for (var loc_i in date_entry.loc_histories) {
          var loc_entry = date_entry.loc_histories[loc_i];

          var loc_inv = {
            "name": loc_entry.location,
            "histories": loc_entry.
          }

          var histories = [];
          for (var item_i in loc_entry.histories) {
            var item_entry = loc_entry.histories[item_i];
            histories.push()
          }
        }


        $scope.invData['loc_sum'].push(loc_histories);
      }
      //console.log($scope.invData['loc_sum']);
      */

      $scope.display_items = $scope.invData['loc_itemized'];
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

  $scope.plotLocations = function() {
    var margin = {top:20,right:80,bottom:30,left:50};
    var width = 800 - margin.left - margin.right;
    var height = 500 - margin.top - margin.bottom;

    var formatValue = d3.format(",.2f");
    var formatCurrency = function(d) { return "$" + formatValue(d); };

    var x = d3.time.scale().range([0, width]);
    var y = d3.scale.linear().range([height, 0]);

    var color = d3.scale.category10();
    if ($scope.invData['loc_sum'].length > 10) {
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
    for (var i in $scope.invData['loc_sum']) {
      var loc_histories = $scope.invData['loc_sum'][i].histories;
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

    for (var loc_i in $scope.invData['loc_sum']) {
      var d = $scope.invData['loc_sum'][loc_i].histories;
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
        .text($scope.invData['loc_sum'][loc_i].location)
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
  // Date picker
  $scope.minDate = null;
  $scope.opened = {'start':false, 'end':false};
  $scope.dates = {'start':null, 'end':null};

  $scope.formats = ['MMMM dd yyyy', 'yyyy/MM/dd', 'dd.MM.yyyy', 'shortDate'];
  $scope.format = $scope.formats[0];

  $scope.today = function() {
    var today = new Date();
    // start date is by default 4 weeks ago
    $scope.dates.start = new Date(today.setDate(today.getDate() - 30));
    $scope.dates.end = new Date();
  };
  $scope.today();

  $scope.clear = function () {
    $scope.dates.start = null;
    $scope.dates.end = null;
  };

  $scope.toggleMin = function() {
    //$scope.minDate = $scope.minDate ? null : new Date();
  };
  //$scope.toggleMin();

  $scope.openDateStart = function($event) {
    $event.preventDefault();
    $event.stopPropagation();

    $scope.opened.start = !$scope.opened.start;
    
  };

  $scope.openDateEnd = function($event) {
    $event.preventDefault();
    $event.stopPropagation();

    $scope.opened.end = !$scope.opened.end;
  };

  $scope.startDateChanged = function() {
    $scope.dates.start.setHours(0,0,0);
    console.log('start date is now: ' + $scope.dates.start);
    $scope.checkStartEndDates();

    // refresh select sort type to refresh data from server
    $scope.selectSortType($scope.sort_type);
  };

  $scope.endDateChanged = function() {
    $scope.dates.end.setHours(23,59,59);
    console.log('end date is now: ' + $scope.dates.end);
    $scope.checkStartEndDates();

    // refresh select sort type to refresh data from server
    $scope.selectSortType($scope.sort_type);
  };

  $scope.checkStartEndDates = function() {
    if ($scope.dates.start > $scope.dates.end) {
      $scope.dates.end = $scope.dates.start;
    }
  };

  $scope.dateOptions = {
    formatYear: 'yy',
    startingDay: 1,
    showWeeks:'false'
  };

  $scope.getDayClass = function(date, mode) {
    if (mode === 'day') {
      var dayToCheck = new Date(date).setHours(0,0,0,0);

      for (var i=0;i<$scope.events.length;i++){
        var currentDay = new Date($scope.events[i].date).setHours(0,0,0,0);

        if (dayToCheck === currentDay) {
          return $scope.events[i].status;
        }
      }
    }

    return '';
  };

  $scope.selectUseMode($scope.use_modes[0]);

});


