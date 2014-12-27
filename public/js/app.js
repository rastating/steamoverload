var app = angular.module('steamoverload', [
    'ngRoute',
    'controllers'
]);

app.factory('$session', function ($http) {
    return {
        fetch: function () {
            return $http.get('/api/session/');
        },
        destroy: function () {
            return $http.delete('/api/session');
        }
    };
});

app.config(function ($routeProvider, $locationProvider) {
    $routeProvider.
        when('/', {
            templateUrl: '/static/partials/home.html',
            controller: 'HomeCtrl'
        }).
        when('/user/:userid', {
            templateUrl: '/static/partials/account.html',
            controller: 'AccountCtrl'
        }).
        otherwise({
            redirectTo: '/'
        });

    $locationProvider.html5Mode(true);
});

app.run(function ($rootScope, $location, $session) {
    $rootScope.logout = function () {
        $session.destroy().then(function () {
            $rootScope.session.authenticated = false;
            $rootScope.session.user = {};
        });
    };

    $rootScope.$on("$routeChangeStart", function (event, next, current) {
        $session.fetch().then(function (session) {
            $rootScope.session = session.data;
        });
    });
});