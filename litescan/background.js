/**
请求等待时间 
 */
var HTTP_REQUEST_TIMEOUT = 10 * 1000;
var HEAD_REQUEST_TIMEOUT = 5 * 1000;
/**
标题栏
 */
var RESULTS_TITLE = 'LiteScan';

var popupDoc = null;

/**
目标列表
 */
var target_urls = null;

/**
内部参数
 */
// 内容扫描页面
var spiderTab = null;
// 扫描器页面
var resultsTab = null;

var httpRequest = null;
var httpRequestWatchDogPid = 0;
var newTabWatchDogPid = 0;
var started = false;
var paused = false;
var requestedURL = null;


/**
初始化配置页面
 */
function popupLoaded(doc) {
    popupDoc = doc;
    chrome.tabs.getSelected(null, setDefaultUrl_);
}


/**
给目标页面赋值
 */
function setDefaultUrl_(tab) {
    // Use the currently selected tab's URL as a start point.
    var url;
    if (tab && tab.url && tab.url.match(/^\s*https?:\/\//i)) {
        url = tab.url;
    } else {
        url = 'http://www.example.com/';
    }
    popupDoc.getElementById('start').value = url;
}


/**
构造扫描列表
**/
function makeTargets(url){
    target_urls = new Array();
    for (var i = KEYS.length - 1; i >= 0; i--) {
        tmpkey = KEYS[i];
        for (var j = EXTS.length - 1; j >= 0; j--) {
            tmp_exts = EXTS[j];
            tmpfile = tmp_exts.replace('$',tmpkey);
            tmp = url + '/' + tmpfile;
            target_urls.push(tmp);
        }
    }
    for (var i = TARGETS.length - 1; i >= 0; i--) {
        tmp = url + '/' + TARGETS[i];
        target_urls.push(tmp);
    }
}

/**
启动扫描程序
 */
function popupGo() {
    //关闭之前的扫描
    popupStop();

    var resultsWindows = chrome.extension.getViews({
        type: 'tab'
    });
    for (var x = 0; x < resultsWindows.length; x++) {
        var doc = resultsWindows[x].document;
        if (doc.title == RESULTS_TITLE) {
            doc.title = RESULTS_TITLE + ' - Closed';
        }
    }
    // 生成扫描列表
    var startPage = popupDoc.getElementById('start').value;
    makeTargets(startPage);

    function resultsLoadCallback_(tab) {
        resultsTab = tab;
        window.setTimeout(resultsLoadCallbackDelay_, 100);
    }
    function resultsLoadCallbackDelay_(){
        chrome.tabs.sendMessage(resultsTab.id, {
            method:"getElementById",
            id:"startingOn",
            action:"setInnerHTML",
            value:setInnerSafely(startPage)
        });
        started = true;
        //多开线程速度会快，但是有资源争用问题
        spiderPage();
        //spiderPage();
        //spiderPage();
        //spiderPage();
        //spiderPage();
    }

    // 创建扫描页面
    chrome.tabs.create({
        url: 'results.html'
    }, resultsLoadCallback_);
}

/**
html字符串安全过滤
 */
function setInnerSafely(msg) {
    msg = msg.toString();
    msg = msg.replace(/&/g, '&amp;');
    msg = msg.replace(/</g, '&lt;');
    msg = msg.replace(/>/g, '&gt;');
    return msg;
}
/**
清理残留资源，重置设置
 */
function popupStop() {
    started= false;
    closeSpiderTab();
    spiderTab = null;
    resultsTab = null;
    window.clearTimeout(httpRequestWatchDogPid);
    window.clearTimeout(newTabWatchDogPid);
    popupDoc.getElementById('siteSpiderGo').disabled = false;
}

/**
 * Start spidering one page.
 */
function spiderPage() {
    if(paused){
        return;
    }
    setStatus('Next target...');
    if (!resultsTab) {
        // Results tab was closed.
        return;
    }

    // 压出一个目标地址
    var url = target_urls.pop();
    if (!url) {
        // Done.
        setStatus('Complete');
        popupStop();
        return;
    }
    // Record page details.
    requestedURL =url;
    // Fetch this page using Ajax.
    setStatus('try ' + url);
    //setStatus('Prefetching ' + KEYS);
    httpRequestWatchDogPid = window.setTimeout(httpRequestWatchDog, HEAD_REQUEST_TIMEOUT);
    httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = httpRequestChange;
    httpRequest.open('HEAD', url, false);
    // 发送请求
    window.setTimeout(function() {
        httpRequest.send(null);
    }, 1);
}

/**
 * 网络请求看门狗
 */
function httpRequestWatchDog() {
    setStatus('Aborting HTTP Request');
    if (httpRequest) {
        httpRequest.abort();
    }
    window.setTimeout(spiderPage, 1);
}

/**
 * 内容扫描页面看门狗
 */
function newTabWatchDog() {
    setStatus('Aborting New Tab');
    closeSpiderTab();
    window.setTimeout(spiderPage, 1);
}

/**
 * 接受网络请求
 */
function httpRequestChange() {
    if (!httpRequest || httpRequest.readyState < 2) {
        // Still loading.  Wait for it.
        return;
    }
    var code = httpRequest.status;
    var url = requestedURL;
    // 结束请求看门狗
    window.clearTimeout(httpRequestWatchDogPid);
    // 记录扫描结果
    if(url){
        recordPage(url,code);
    }
    //扫描结果处理
    if(code < 300 ) {
        // 内容扫描
        setStatus('Content scan ' + requestedURL);
        newTabWatchDogPid = window.setTimeout(newTabWatchDog, HTTP_REQUEST_TIMEOUT);
        chrome.tabs.create({
            url: requestedURL,
            selected: false
        }, spiderLoadCallback_);
    } else {
        // 下一目标
        window.setTimeout(spiderPage, 1);
    }
}

/**
注入扫描js
 */
function spiderLoadCallback_(tab) {
    spiderTab = tab;
    setStatus('keywords scan' + spiderTab.url);
    chrome.tabs.executeScript(spiderTab.id, {
        file: 'config.js'
    });
    chrome.tabs.executeScript(spiderTab.id, {
        file: 'spider.js'
    });
}

// 信息监听
chrome.extension.onMessage.addListener(
    function(request, sender, sendResponse) {
        if ('keywords' in request) {
            spiderInjectCallback(request.keywords, request.url);
        }
        if ('stop' in request) {
            if(started){
                if (request.stop =="Stopping"){
                    setStatus("Stopped");
                    chrome.tabs.sendMessage(resultsTab.id, {
                        method:"getElementById",
                        id:"stopSpider",
                        action:"setValue",
                        value:"Stopped"
                    });
                    popupStop();
                }
            }
        }
        if ('pause' in request) {
            if (request.pause =="Resume" && started && !paused){
                paused=true;
            }
            if (request.pause =="Pause" && started && paused){
                paused=false;
                spiderPage();
            }
        }

    });

/**
内容扫描结果
 */
function spiderInjectCallback(keywords, url) {
    window.clearTimeout(newTabWatchDogPid);
    setStatus('Scanning ' + url);
    returnedURL = url;
    //记录扫描结果
    recordkeys(keywords,url);
    //等待js执行完毕再关闭tab
    window.setTimeout(function(){
        closeSpiderTab();
    },18);
    window.setTimeout(function(){
        spiderPage();
    },20);
}

function closeSpiderTab(){
    if (spiderTab)
        chrome.tabs.remove(spiderTab.id);
    spiderTab = null;

}


/**
记录扫描结果
 */
function recordPage(url,code) {
    var requestedURL = '<a href="' + url + '" target="spiderpage" title="' + url + '">' + url + '</a>';
    value ='<td>' + requestedURL + '</td>' + '<td>' + code + '</td>';
    if (code != "404"){
        chrome.tabs.sendMessage(resultsTab.id, {
            id:"resultbody",
            action:"insertBodyTR",
            value:value
        });        
    }
}
function recordkeys(keywords,url) {
    var requestedURL = '<a href="' + url + '" target="spiderpage" title="' + url + '">' + url + '</a>';
    value ='<td>'+requestedURL+'</td>'+'<td>' + setInnerSafely(keywords) + '</td>';
    chrome.tabs.sendMessage(resultsTab.id, {
        id:"verbosebody",
        action:"insertBodyTR",
        value:value
    });
}

/**
更新扫描结果
 */
function setStatus(msg) {
    if(started){
        try{
            chrome.tabs.sendMessage(resultsTab.id, {
                method:"getElementById",
                id:"queue",
                action:"setInnerHTML",
                value:Object.keys(target_urls).length
            });
            chrome.tabs.sendMessage(resultsTab.id, {
                method:"getElementById",
                id:"status",
                action:"setInnerHTML",
                value:setInnerSafely(msg)
            });
        }catch(err){
            popupStop();
        }
    }
}

