'use strict';

angular.module('myApp.viewHistory', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewHistory', {
    templateUrl: 'view_history/view_history.html',
    controller: 'ViewHistoryCtrl'
  });
}])

.controller('ViewHistoryCtrl', function($scope, $http) {

  $scope.sort_types = ["All Beverages", "By Location", "By Beverage Type", "Individual Items"];
  $scope.sort_type = $scope.sort_types[0];

  $scope.invData = [];

  $scope.getAll = function() {
    $http.get('/inv/history', {
      params: { type: 'all' }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      $scope.invData = [];
      var parseDate = d3.time.format("%Y-%m-%d").parse;

      for (var date_i in data)
      {
        var update = data[date_i].update;
        var date_str = update.substring(0,update.indexOf('T'));

        $scope.invData.push({
          'update':parseDate(date_str),
          'inventory_sum':data[date_i].inventory_sum});
      }
      $scope.invData.sort(function(a, b) {
        return a.update - b.update;
      });
      console.log($scope.invData);

      $scope.plotAll();
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.plotAll = function() {

    var margin = {top:20,right:20,bottom:30,left:50};
    var width = 800 - margin.left - margin.right;
    var height = 500 - margin.top - margin.bottom;

    var parseDate = d3.time.format("%Y-%m-%d").parse;

    var x = d3.time.scale().range([0, width]);

    var y = d3.scale.linear().range([height, 0]);

    var xAxis = d3.svg.axis().scale(x).orient("bottom");

    var yAxis = d3.svg.axis().scale(y).orient("left");

    var line = d3.svg.line()
        .x(function(d) { return x(d.update); })
        .y(function(d) { return y(d.inventory_sum); });

    var svg = d3.select('#d3viz')
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    //x.domain([$scope.invData[0].update, $scope.invData[$scope.invData.length-1].update]);
    x.domain(d3.extent($scope.invData, function(d) {return d.update; }));
    y.domain(d3.extent($scope.invData, function(d) {return d.inventory_sum * 1.1}));

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

    svg.append("path")
      .datum($scope.invData)
      .attr("class", "line")
      .attr("d", line);

    svg.selectAll("dot")
        .data($scope.invData)
      .enter().append("circle")
        .attr("r", 5)
        .attr("cx", function(d) { return x(d.update); })
        .attr("cy", function(d) { return y(d.inventory_sum); })
        .attr("fill", "#44bb99");
  };

  $scope.getAll();

});



