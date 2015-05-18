'use strict';

angular.module('myApp.viewHistory', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewHistory', {
    templateUrl: 'view_history/view_history.html',
    controller: 'ViewHistoryCtrl'
  });
}])

.controller('ViewHistoryCtrl', function($scope, $http) {

  $scope.sort_types = ["Total Inventory", "By Location", "Individual Items"/*", By Beverage Type"*/ ];
  $scope.sort_type = $scope.sort_types[0];

  $scope.invData = [];

  $scope.all_items = [];
  $scope.added_items = [];

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

  $scope.selectSortType = function( type ) {

    d3.select("#d3viz").selectAll("*").remove();

    $scope.sort_type = type;
    $scope.invData = [];
    $scope.removeAddedItems();
    
    if (type === $scope.sort_types[0]) {
      $scope.getAll();
    } else if (type === $scope.sort_types[1]) {
      $scope.getLocations();
    } else if (type === $scope.sort_types[2]) {
      if ($scope.all_items.length === 0) {
        $scope.getAllBeverages();
      }
      $scope.plotIndividuals();
    }
  };

  $scope.getAllBeverages = function() {
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

  $scope.addItem = function(item) {
    for (var i in $scope.all_items) {
      if (item == $scope.all_items[i]) {
        $scope.all_items.splice(i, 1);
        break;
      }
    }
    $scope.added_items.push(item);

    $scope.getItemData(item);
  };

  $scope.removeAddedItem = function(item) {
    for (var i in $scope.added_items) {
      if (item == $scope.added_items[i]) {
        $scope.added_items.splice(i, 1);
        break;
      }
    }
    for (var i in $scope.invData) {
      var item_history = $scope.invData[i];
      if (item_history.product === item.product) {
        $scope.invData.splice(i, 1);
        break;
      }
    }
    $scope.all_items.push(item);
    $scope.all_items.sort(function(a, b) {
      var keyA = a['product'];
      var keyB = b['product'];
      return keyA.localeCompare(keyB);
    });

    //console.log($scope.invData);

    d3.select("#d3viz").selectAll("*").remove();
    $scope.plotIndividuals();
  };

  $scope.getLocalD3DateFromUTCTimeStamp = function(timestamp) {

    var parseDate = d3.time.format("%Y-%m-%d").parse;
    var date_str = timestamp.substring(0,timestamp.indexOf('T'));
    return parseDate(date_str);
  };

  $scope.getItemData = function(item) {
    $http.get('/inv/history', {
      params: { 
        type: 'item',
        id: item.id }
    }).
    success(function(data, status, headers, config) {
      //console.log(data);

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
          'update':$scope.getLocalD3DateFromUTCTimeStamp(update),
          'inventory_sum':histories[his_i].inventory_sum});
        item_histories.histories.sort(function(a,b) {
          return a.update - b.update;
        });
      }
      $scope.invData.push(item_histories);
      //console.log($scope.invData);

      d3.select("#d3viz").selectAll("*").remove();

      $scope.plotIndividuals();
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.getAll = function() {
    $http.get('/inv/history', {
      params: { type: 'all' }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      //console.log(data);

      for (var date_i in data)
      {
        var update = data[date_i].update;

        $scope.invData.push({
          'update':$scope.getLocalD3DateFromUTCTimeStamp(update),
          'inventory_sum':data[date_i].inventory_sum});
      }
      $scope.invData.sort(function(a, b) {
        return a.update - b.update;
      });
      //console.log($scope.invData);

      $scope.plotAll();
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.getLocations = function() {
    $http.get('/inv/history', {
      params: { type: 'locations' }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      //console.log(data);

      for (var loc_i in data)
      {
        var loc_name = data[loc_i].location;
        var histories = data[loc_i].histories;

        var loc_histories = {
          "location": loc_name,
          "histories": []
        }

        for (var his_i in histories) {
          var update = histories[his_i].update;

          loc_histories.histories.push({
            'update':$scope.getLocalD3DateFromUTCTimeStamp(update),
            'inventory_sum':histories[his_i].inventory_sum});
          loc_histories.histories.sort(function(a,b) {
            return a.update - b.update;
          });
        }

        $scope.invData.push(loc_histories);
      }
      //console.log($scope.invData);

      $scope.plotLocations();
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
    if ($scope.invData.length > 10) {
      color = d3.scale.category20();
    }

    var xAxis = d3.svg.axis().scale(x)
      .orient("bottom")
      .tickFormat(d3.time.format("%b %d"))
      .ticks(d3.time.days, 3);

    var yAxis = d3.svg.axis().scale(y).orient("left");

    var line = d3.svg.line()
        .x(function(d) { return x(d.update); })
        .y(function(d) { return y(d.inventory_sum); });

    var svg = d3.select('#d3viz')
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var min_time = null, max_time = null;
    var max_inv_sum = 0;
    for (var i in $scope.invData) {
      var loc_histories = $scope.invData[i].histories;
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
        if (max_inv_sum < his.inventory_sum) {
          max_inv_sum = his.inventory_sum;
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

    for (var item_i in $scope.invData) {
      var d = $scope.invData[item_i].histories;
      var product = $scope.invData[item_i].product;

      if (d.length===0 || d === null) {
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
            .attr("cy", function(d) { return y(d.inventory_sum); })
            .attr("fill", color(item_i))
      svg.selectAll("dot_hover")
          .data(d)
        .enter()
          .append("circle")
            .attr("r", 10)
            .attr("cx", function(d) { return x(d.update); })
            .attr("cy", function(d) { return y(d.inventory_sum); })
            .attr("fill", "transparent")
            .on("mouseover", mouseover)
            .on("mouseout", mouseout);

      var button_id = "#a_item_" + item_i.toString();
      d3.select(button_id)
        .style("background-color",color(item_i));

      svg.append("text")
        .attr("x", x(d[d.length-1].update) + 4 )
        .attr("y", y(d[d.length-1].inventory_sum) - 10 )
        .attr("dy", ".35em")
        .attr("font-size", "0.8em")
        .text($scope.invData[item_i].location)
        .style("fill", color(item_i));
    }
    function mouseover(d) {
      focus.attr("transform", "translate(" + x(d.update) + "," + y(d.inventory_sum) + ")");
      focus.select("#focus_inv").text(formatCurrency(d.inventory_sum));
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
    if ($scope.invData.length > 10) {
      color = d3.scale.category20();
    }

    var xAxis = d3.svg.axis().scale(x)
      .orient("bottom")
      .tickFormat(d3.time.format("%b %d"))
      .ticks(d3.time.days, 3);

    var yAxis = d3.svg.axis().scale(y).orient("left");

    var line = d3.svg.line()
        .x(function(d) { return x(d.update); })
        .y(function(d) { return y(d.inventory_sum); });

    var svg = d3.select('#d3viz')
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var min_time = null, max_time = null;
    var max_inv_sum = 0;
    for (var i in $scope.invData) {
      var loc_histories = $scope.invData[i].histories;
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
        if (max_inv_sum < his.inventory_sum) {
          max_inv_sum = his.inventory_sum;
        }
      }
    }
    x.domain([min_time, max_time]);
    y.domain([0, max_inv_sum*1.1]);
      
    /*
    var all_locs = [];
    for (var i in $scope.invData) {
      all_locs.push($scope.invData[i].location);
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

    for (var loc_i in $scope.invData) {
      var d = $scope.invData[loc_i].histories;
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
            .attr("cy", function(d) { return y(d.inventory_sum); })
            .attr("fill", color(loc_i))
      svg.selectAll("dot_hover")
          .data(d)
        .enter()
          .append("circle")
            .attr("r", 10)
            .attr("cx", function(d) { return x(d.update); })
            .attr("cy", function(d) { return y(d.inventory_sum); })
            .attr("fill", "transparent")
            .on("mouseover", mouseover)
            .on("mouseout", mouseout);

      svg.append("text")
        .attr("x", x(d[d.length-1].update) + 4 )
        .attr("y", y(d[d.length-1].inventory_sum) - 10 )
        .attr("dy", ".35em")
        .attr("font-size", "0.8em")
        .text($scope.invData[loc_i].location)
        .style("fill", color(loc_i));
    }

    function mouseover(d) {
      focus.attr("transform", "translate(" + x(d.update) + "," + y(d.inventory_sum) + ")");
      focus.select("#focus_inv").text(formatCurrency(d.inventory_sum));
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
        .y(function(d) { return y(d.inventory_sum); });

    var svg = d3.select('#d3viz')
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    x.domain(d3.extent($scope.invData, function(d) {return d.update; }));
    y.domain(d3.extent($scope.invData, function(d) {return d.inventory_sum * 1.1}));

    svg.append("path")
      .datum($scope.invData)
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
        .data($scope.invData)
      .enter().append("circle")
        .attr("r", 4)
        .attr("cx", function(d) { return x(d.update); })
        .attr("cy", function(d) { return y(d.inventory_sum); })
        .attr("fill", "#44bb99");
    svg.selectAll("dot_hover")
        .data($scope.invData)
      .enter()
        .append("circle")
          .attr("r", 20)
          .attr("cx", function(d) { return x(d.update); })
          .attr("cy", function(d) { return y(d.inventory_sum); })
          .attr("fill", "transparent")
          .on("mouseover", mouseover )
          .on("mouseout", function() { focus.style("display", "none"); });

    function mouseover(d) {
      focus.attr("transform", "translate(" + x(d.update) + "," + y(d.inventory_sum) + ")");
      focus.select("#focus_inv").text(formatCurrency(d.inventory_sum));
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
      focus.attr("transform", "translate(" + x(d.update) + "," + y(d.inventory_sum) + ")");
      focus.select("#focus_inv").text(formatCurrency(d.inventory_sum));
      focus.select("#focus_date").text(d3.time.format("%b %d")(d.update));
    }
  */
  };

  $scope.getAll();
  //$scope.getLocations();

});



