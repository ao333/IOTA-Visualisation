/*
  This file defines all functions that calculate statistics and store statistics into MongoDb
 */

const driver = require('../config/config_neo4j');
const Statistics = require('../models/Statistics');
const ConfirmTime = require('../models/ConfirmTime');
const iota = require('../config/config_iota');
const update = require('./update');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

/**
 * update mean confirmation time
 * @param callback
 */
function updateMeanCon(callback){
  ConfirmTime.find({}, function (error, doc) {
    if(error) console.log(error);
    if(doc){
      let n = doc.length;
      let sum = 0;
      for(let i = 0; i < n; i++){
        sum = sum + doc[i].confirm_time - doc[i].create_time;
      }
      let average;
      let minites;
      if(n === 0)
        minites = 0;
      else{
        average = sum / n;
        minites = average/1000/60;
      }
      Statistics.findOne({}, function (error, doc) {
        if(error) console.log(error);
        if(doc){
          doc["MeanConTime"] = minites;
          doc.save(function (error, aa) {
            if(error) console.log(error);
            callback();
          })
        }
      });
    }
  })
}

/**
 * update amount of tips
 * @param callback
 */
function updateTips(callback){
  iota.api.getTips(function(error, alltips){
    Statistics.findOne({}, function (error, doc) {
      if(error) console.log(error);
      if(alltips && doc){
        doc["TotalTips"] = alltips.length;
        doc.save(function (error, aa) {
          if(error) console.log(error);
          callback();
        })
      }
    })
  });
}

/**
 * update value per second
 * @param callback
 */
function updateValuePerSecond(callback){
  let session = driver.session();
  session
    .run('MATCH (tran) RETURN tran')
    .then(function (result) {
      let latest_time = Number.MAX_SAFE_INTEGER;
      let earliest_time = -1;
      let sum = 0;
      let total_amount = 0;
      let non_zero_amount = 0;
      result.records.forEach(function (record) {
        total_amount++;
        if(record.toObject().tran.properties.value > 0){
          non_zero_amount++;
          sum += record.toObject().tran.properties.value.toInt();
          if(record.toObject().tran.properties.create_time > latest_time)
            latest_time = record.toObject().tran.properties.create_time;
          else if(record.toObject().tran.properties.create_time < earliest_time)
            earliest_time = record.toObject().tran.properties.create_time;
        }
      });
      let meanPerSecond;
      let non_zero_percent;
      let valuePerTran;
      if(latest_time - earliest_time !== 0)
        meanPerSecond = sum / ((latest_time - earliest_time)/1000);
      else
        meanPerSecond = 0;
      if(total_amount !== 0)
        non_zero_percent = non_zero_amount / total_amount;
      else
        non_zero_percent = 0;
      if(non_zero_amount !== 0)
        valuePerTran = sum / non_zero_amount;
      else
        valuePerTran = 0;
      Statistics.findOne({}, function (error, doc) {
        if(error) {
          callback(error, null);
          session.close();
        }
        if(doc){
          if(meanPerSecond !== 0)
            doc["ValuePerSec"] = meanPerSecond;
          if(non_zero_percent !== 0)
            doc["Non_value_Percent"] = non_zero_percent;
          if(valuePerTran !== 0)
            doc["ValuePerTran"] = valuePerTran;
          doc.save(function (error, aa) {
            if(error) {
              callback(error, null);
              session.close();
            }
            callback(null, true);
            session.close();
          })
        }
      });
    })
    .catch(function (error) {
      session.close();
      console.log(error);
    });
}

/**
 * put newly confirmed transaction into MongoDb
 * @param update_transactions
 */
function extractConfirmed(update_transactions) {
  if(update_transactions.length === 0)
    return;
  let session = driver.session();
  let query_string = update.queryTransactionsFromHashString(update_transactions);
  let transactions = [];
  session
    .run(query_string)
    .then(function (result) {
      result.records.forEach(function (record) {
        if(record.toObject().tran.labels[0] === "confirmed"){
          let obj = {};
          obj.create_time = record.toObject().tran.properties.create_time;
          obj.confirm_time = record.toObject().tran.properties.time;
          transactions.push(obj);
        }
      });
      if(transactions.length > 0){
        ConfirmTime.create(transactions, function (error, doc) {
          if(error){
            console.log(error);
            session.close();
          }else{
          }
        })
      }
    })
    .catch(function (error) {
      session.close();
      console.log(error);
    });
}

function updatePrice(callback){
  let xhttp = new XMLHttpRequest();
  xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      let price = JSON.parse(xhttp.responseText).GBP;
      Statistics.findOne({}, function (error, doc) {
        if(error) console.log(error);
        if(doc){
          doc["Price"] = price;
          doc.save(function (error, aa) {
            if(error) console.log(error);
            callback();
          })
        }
      })
    }
  };
  xhttp.open("GET", "https://min-api.cryptocompare.com/data/price?fsym=IOTA&tsyms=GBP", true);
  xhttp.send();
}

module.exports = {
  extractConfirmed,
  updateMeanCon,
  updateTips,
  updateValuePerSecond,
  updatePrice
};