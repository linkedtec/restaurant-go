'use strict';

// Declare app level module which depends on views, and components
angular.module('myApp', [
  'ngRoute',
  'myApp.viewAllInv',
  'myApp.viewDistributors',
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

    getPrettyDate: function (date_str, from_server) {
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
        pretty_date = pretty_tokens[0] + ", " + pretty_tokens[1] + " " + pretty_tokens[2] + " " + pretty_tokens[3];
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
    }
  };
});

