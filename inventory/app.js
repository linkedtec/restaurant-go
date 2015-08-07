'use strict';

// Declare app level module which depends on views, and components
angular.module('myApp', [
  'ngRoute',
  'myApp.viewAllInv',
  'myApp.viewDistributors',
  'myApp.viewInvByLoc',
  'myApp.viewOnTap',
 // 'myApp.viewEmptyKegs',
  'myApp.viewHistory'
]).
config(['$routeProvider', function($routeProvider) {
  $routeProvider.otherwise({redirectTo: '/viewAllInv'});
}])
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

    getDateFromUTCTimeStamp: function(timestamp, local) {
      return getDateFromUTCTimeStamp(timestamp, local)
    },

    timeZoneOffset: function() {
      // two notes here:
      // 1. getTimezoneOffset returns minutes, so need to divide by 60
      // 2. getTimezoneOffset returns a difference, so need to invert sign to
      //    get the +2, -6, etc sign correct in timestamps
      return (new Date().getTimezoneOffset()/60);
    }
  };
});

