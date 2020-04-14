/**
内容搜索
 */
function check_keywords() {
    var res = [];
    var txt = document.body.innerHTML;
    for (var i = KEYS.length - 1; i >= 0; i--) {
        tmp = KEYS[i];
        rexstr = ".*?" + tmp + ".*?";
        tmpres = txt.match(rexstr);
        if (tmpres) {
            res.push(tmpres[0]);
        }
    }
    var txt = document.head.innerHTML;
    for (var i = KEYS.length - 1; i >= 0; i--) {
        tmp = KEYS[i];
        rexstr = ".*?" + tmp + ".*?";
        tmpres = txt.match(rexstr);
        if (tmpres) {
            res.push(tmpres[0]);
        }
    }
    return res;
}

window.attemptedLoads = 0;

function finish(){
    if((!document || document.readyState !='complete') && window.attemptedLoads<6) {
        window.clearTimeout(window.pageLoaderPid);
        window.pageLoaderPid = window.setTimeout( finish, 500 );
        window.attemptedLoads++;
        return;
    }
    chrome.runtime.sendMessage({
        keywords: check_keywords(),
        url:document.location.href
    });
}

window.pageLoaderPid = window.setTimeout( finish, 500 );

