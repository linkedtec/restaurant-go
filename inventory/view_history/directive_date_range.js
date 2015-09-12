angular.module('myApp')

.directive('dateRange', function($modal, $http, $timeout) {
  return {
    restrict: 'AE',
    scope: {
      startDate: '=',
      endDate: '=',
      onStartChange: '&',
      onEndChange: '&'
    },
    templateUrl: './view_history/template_date_range.html',
    link: function(scope, elem, attrs) {

      //=====================================
      // Date picker
      scope.minDate = null;
      scope.opened = {'start':false, 'end':false};

      scope.formats = ['MMMM dd yyyy', 'yyyy/MM/dd', 'dd.MM.yyyy', 'shortDate'];
      scope.format = scope.formats[0];

      scope.today = function() {
        var today = new Date();
        // start date is by default 1 week ago
        scope.startDate = new Date(today.setDate(today.getDate() - 6));
        scope.startDate.setHours(0,0,0);
        scope.endDate = new Date();
        scope.endDate.setHours(23,59,59);
      };
      scope.today();

      scope.clear = function () {
        scope.startDate = null;
        scope.endDate = null;
      };

      scope.toggleMin = function() {
        //scope.minDate = scope.minDate ? null : new Date();
      };
      //scope.toggleMin();

      scope.openDateStart = function($event) {
        $event.preventDefault();
        $event.stopPropagation();

        scope.opened.start = !scope.opened.start;
        
      };

      scope.openDateEnd = function($event) {
        $event.preventDefault();
        $event.stopPropagation();

        scope.opened.end = !scope.opened.end;
      };

      scope.startDateChanged = function() {
        scope.startDate.setHours(0,0,0);
        console.log('start date is now: ' + scope.startDate);
        scope.checkStartEndDates();

        $timeout((function() {
          if (scope.onStartChange!==null) {
            scope.onStartChange();
          }
        }), 0);

      };

      scope.endDateChanged = function() {
        scope.endDate.setHours(23,59,59);
        console.log('end date is now: ' + scope.endDate);
        scope.checkStartEndDates();

        $timeout((function() {
          if (scope.onEndChange!==null) {
            scope.onEndChange();
          }
        }), 0);

      };

      // sets the end date to today, and start day @days ago
      scope.setRange = function(days) {
        var today = new Date();
        scope.endDate = new Date();
        scope.endDate.setHours(23,59,59);

        scope.startDate = new Date(today.setDate(today.getDate() - days));
        scope.startDate.setHours(0,0,0);

        // onEndChange and onStartChange call the same callback right now,
        // so just need to call into one of them
        $timeout((function() {
          if (scope.onStartChange!==null) {
            scope.onStartChange();
          }
        }), 0);
      }

      scope.checkStartEndDates = function() {
        if (scope.startDate > scope.endDate) {
          scope.endDate = scope.startDate;
        }
      };

      scope.dateOptions = {
        formatYear: 'yy',
        startingDay: 1,
        showWeeks:'false'
      };

      scope.getDayClass = function(date, mode) {
        if (mode === 'day') {
          var dayToCheck = new Date(date).setHours(0,0,0,0);

          for (var i=0;i<scope.events.length;i++){
            var currentDay = new Date(scope.events[i].date).setHours(0,0,0,0);

            if (dayToCheck === currentDay) {
              return scope.events[i].status;
            }
          }
        }

        return '';
      };
    }
  }
});