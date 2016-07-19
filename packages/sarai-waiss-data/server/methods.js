// helper function to computer ETo using Hargreaves method
// TODO: Switch to PM method if more data becomes available
var computeETo = function(tmin, tmax, latitude, dayOfTheYear) {
    var solarDeclination = 0.409 * Math.sin(((2 * Math.PI * dayOfTheYear) / 365)- 1.39);
    var parameterX = 1 - ((Math.tan(latitude) * Math.tan(latitude)) * (Math.tan(solarDeclination) * Math.tan(solarDeclination)));
    var numerator = (-Math.tan(latitude)) * Math.tan(solarDeclination);
    var sunsetHourAngle = (Math.PI / 2) - Math.atan(numerator / Math.sqrt(parameterX));
    var dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfTheYear / 365));
    var extraTerrestrialRadiation = 1440 / Math.PI * 0.082 * dr * ((sunsetHourAngle * Math.sin(latitude) * Math.sin(solarDeclination)) + (Math.cos(latitude) * Math.cos(solarDeclination) * Math.sin(sunsetHourAngle)));
    var ETo = 0.0023 * (((tmin + tmax) / 2) + 17.8) * Math.sqrt(tmax - tmin) * extraTerrestrialRadiation;

    return ETo;
}

//helper function to compute the crop coefficient of a given crop
var computeKc = function(cropInfo, maturity) {
    if(maturity < cropInfo.cutoff[0]) {
        return cropInfo.cropCoefficient[0];
    }

    if(maturity < cropInfo.cutoff[1]) {
        return cropInfo.cropCoefficient[0] + 
               ((cropInfo.cropCoefficient[1] - cropInfo.cropCoefficient[0]) / (cropInfo.cutoff[1] - cropInfo.cutoff[0])) * 
               (maturity - cropInfo.cutoff[0]);
    } else {
        if(maturity > cropInfo.cutoff[2]) {
            return cropInfo.cropCoefficient[1] - 
               ((cropInfo.cropCoefficient[1] - cropInfo.cropCoefficient[2]) / (100 - cropInfo.cutoff[2])) * 
               (maturity - cropInfo.cutoff[2]);
        } else {
            return cropInfo.cropCoefficient[2];
        }
    }
}

var degToRad = function(deg) {
    return deg * Math.PI / 180;
}

var computeDayOfTheYear = function(date) {
    var start = new Date(date.getFullYear(), 0, 0);
    var diff = date - start;
    var oneDay = 1000 * 60 * 60 * 24;
    var day = Math.ceil(diff / oneDay);

    return day;
}

Meteor.methods({
    'computeWaterDeficit': function(farmInfo, tmin, tmax, latitude, dayOfTheYear, date) {
        var ETo = computeETo(tmin, tmax, latitude, dayOfTheYear);

        var cropInfo = CropData.findOne({
            'name': farmInfo.crop.toLowerCase()
        });

        var Kc = computeKc(cropInfo, farmInfo.maturity);

        var ETa = ETo * Kc;

        var weather = WeatherData.findOne({
            'id': farmInfo.weatherStation,
            'date': {
                'year': date.getFullYear(),
                'month': date.getMonth(),
                'day': date.getDate()
            }
        });

        if(weather == null) {
            console.error('no weather data');
            throw new Meteor.Error(404, 'no weather data found');
        }

        var waterDeficit = farmInfo.waterDeficit;

        if(!waterDeficit) {
            waterDeficit = [];
            waterDeficit.push({
                'date': date,
                'data': ETa - weather.data.rainfall
            });
        } else {
            waterDeficit.push({
                'date': date,
                'data': ETa - weather.data.rainfall + waterDeficit[waterDeficit.length-1].data
            });
        }

        Farm.update({
            '_id': farmInfo._id
        },{
            $set: {
                'waterDeficit': waterDeficit
            }
        });
    },
    'createFarm': function(farmInfo) {
        var today = new Date();
        today.setDate(today.getDate() - 1);
        var currentDate = new Date(farmInfo.plantingDate);
        var etoArray = [];
        var waterDeficit = [];
        var rainfallArray = [];
        var cropInfo = CropData.findOne({
            'name': farmInfo.crop.toLowerCase()
        });
        var latitude = degToRad(WeatherStations.findOne({
            'id': farmInfo.weatherStation
        }).coords[0]);
        var gdd = [];
        var cumulativeGDD = 0;
        var maturity = 0;

        while(currentDate.getTime() < today.getTime()) {
            var weather = WeatherData.findOne({
                'id': farmInfo.weatherStation,
                'date': {
                    'year': currentDate.getFullYear(),
                    'month': currentDate.getMonth(),
                    'day': currentDate.getDate()
                }
            });
            // console.log(weather);
            if(typeof weather == 'undefined') {
                console.log(currentDate.toDateString() + ': weather data unavailable, using average ETo from last 3 days')
                var data = 0;
                if(etoArray.length > 3) {
                    for(var i = etoArray.length-1; i > (etoArray.length-1)-3; i--) {
                        data += etoArray[i].data;
                    }
                    data /= 3;
                } else {
                    for(var i = 0; i < etoArray.length; i++) {
                        data += etoArray[i].data;
                    }
                    data /= etoArray.length;
                }

                etoArray.push({
                    'date': {
                        'year': currentDate.getFullYear(),
                        'month': currentDate.getMonth(),
                        'day': currentDate.getDate()    
                    },
                    'dateUTC': new Date(currentDate),
                    data: data
                });

                var tempCurrent = new Date(currentDate);
                tempCurrent.setDate(tempCurrent.getDate() - 1);
                var tminAve = 0;
                var tmaxAve = 0;
                for(var i = 0; i < 3; i++) {
                    var tempWeather = WeatherData.findOne({
                        'id': farmInfo.weatherStation,
                        'date': {
                            'year': tempCurrent.getFullYear(),
                            'month': tempCurrent.getMonth(),
                            'day': tempCurrent.getDate()
                        }
                    });
                    tminAve += tempWeather.data.temp.min;
                    tmaxAve += tempWeather.data.temp.max;
                    tempCurrent.setDate(tempCurrent.getDate() - 1);
                } 
                tminAve /= 3;
                tmaxAve /= 3;

                gdd.push({
                    'date': {
                        'year': currentDate.getFullYear(),
                        'month': currentDate.getMonth(),
                        'day': currentDate.getDate()    
                    },
                    'dateUTC': new Date(currentDate),
                    data: ((tminAve + tmaxAve)/2) - 10
                })

                cumulativeGDD += ((tminAve + tmaxAve)/2) - 10;
                maturity = cumulativeGDD / cropInfo.gddAtMaturity * 100;

                var Kc = computeKc(cropInfo, maturity);
                var ETa = ETo * Kc;

                if(waterDeficit.length === 0) {
                    waterDeficit.push({
                        'date': {
                            'year': currentDate.getFullYear(),
                            'month': currentDate.getMonth(),
                            'day': currentDate.getDate()    
                        },
                        'dateUTC': new Date(currentDate),
                        'data': ETa
                    });
                } else {
                    waterDeficit.push({
                        'date': {
                            'year': currentDate.getFullYear(),
                            'month': currentDate.getMonth(),
                            'day': currentDate.getDate()    
                        },
                        'dateUTC': new Date(currentDate),
                        'data': waterDeficit[waterDeficit.length-1].data + ETa
                    });
                }

                rainfallArray.push({
                    'date': {
                        'year': currentDate.getFullYear(),
                        'month': currentDate.getMonth(),
                        'day': currentDate.getDate()    
                    },
                    'dateUTC': new Date(currentDate),
                    'data': 0
                });
            } else {
                var ETo = computeETo(weather.data.temp.min, weather.data.temp.max, latitude, computeDayOfTheYear(currentDate));

                etoArray.push({
                    'date': {
                        'year': currentDate.getFullYear(),
                        'month': currentDate.getMonth(),
                        'day': currentDate.getDate()    
                    },
                    'dateUTC': new Date(currentDate),
                    data: ETo
                });

                gdd.push({
                    'date': {
                        'year': currentDate.getFullYear(),
                        'month': currentDate.getMonth(),
                        'day': currentDate.getDate()    
                    },
                    'dateUTC': new Date(currentDate),
                    data: weather.data.temp.ave - 10
                });

                cumulativeGDD += weather.data.temp.ave - 10;
                maturity = cumulativeGDD / cropInfo.gddAtMaturity * 100;

                var Kc = computeKc(cropInfo, maturity);
                var ETa = ETo * Kc;

                rainfallArray.push({
                    'date': {
                        'year': currentDate.getFullYear(),
                        'month': currentDate.getMonth(),
                        'day': currentDate.getDate()    
                    },
                    'dateUTC': new Date(currentDate),
                    'data': weather.data.rainfall
                });

                if(waterDeficit.length === 0) {
                    waterDeficit.push({
                        'date': {
                            'year': currentDate.getFullYear(),
                            'month': currentDate.getMonth(),
                            'day': currentDate.getDate()    
                        },
                        'dateUTC': new Date(currentDate),
                        'data': ETa - weather.data.rainfall
                    });
                } else {
                    waterDeficit.push({
                        'date': {
                            'year': currentDate.getFullYear(),
                            'month': currentDate.getMonth(),
                            'day': currentDate.getDate()    
                        },
                        'dateUTC': new Date(currentDate),
                        'data': ETa - weather.data.rainfall + waterDeficit[waterDeficit.length-1].data
                    });
                }
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        Farm.insert({
            'userId': farmInfo.userId,
            'public': farmInfo.public,
            'name': farmInfo.name,
            'crop': farmInfo.crop,
            'variety': farmInfo.variety,
            'plantingDate': farmInfo.plantingDate,
            'location': farmInfo.location,
            'weatherStation': farmInfo.weatherStation,
            'soilType': farmInfo.soilType,
            'data': {
                'waterDeficit': waterDeficit,
                'referenceET': etoArray,
                'gdd': gdd,
                'cumulativeGDD': cumulativeGDD,
                'maturity': maturity,
                'rainfall': rainfallArray
            }
        });

        return {
            name: farmInfo.name
        }
    }
});