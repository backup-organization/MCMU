#!/usr/bin/env node

const [
    fs, dgram, pro, http, ncs
] = (function () {
    return [...arguments].map(x => require(x));
})(
    "fs", "dgram", "./protocol3.js", "http", "./node-console.js"
);
//const port;
function tp(p) {
    return __dirname + "/" + p;
}
const WLANIP = pro.getWlanIP();
function isLocal(ad) {
    return WLANIP.includes(ad);
}
const RAKNET_IP = WLANIP.slice(0, WLANIP.lastIndexOf(".") + 1) + "255";
const DEBUGLEVEL = 1;
const DEBUGLEVELEXPLAIN = [
    "不显示任何调试信息，您可能无法获知数据包信息",
    "随机显示部分调试信息",
    "显示所有调试信息，可能会大量刷屏"
];
function logs() {
    if (DEBUGLEVEL) {
        if (DEBUGLEVEL == 2 || Math.random() > 0.8) console.log(...arguments);
    }
}
const ConfigFile = fs.existsSync("mcmu_config.json") ? fs.readFileSync("mcmu_config.json") : fs.readFileSync(tp("_config.json"));
const {
    remoteAddr: rmtaddr,
    remotePort: rmtport,
    serverPort: srvport
} = JSON.parse(ConfigFile);
{
    let ar = process.argv;
    //node path cmd code
    if (ar.length < 3) {
        ar.length = 3;
    }
    function not3() {
        if (!ar[3]) {
            console.log("请输入编号！");
            process.exit();
            return true;
        }
    }
    switch (ar[2]) {
        case "j":
            if (not3()) break;
            client(ar[3]);
            break;
        case "o":
            host();
            break;
        case "s":
            server();
            break;
        case "t":
            if (not3()) break;
            ping_(ar[3]);
            break;
        case "c":
            config();
            break;
        default:
            console.log("第二个参数必须是o(open),j(join),s(server),c(config)或t(test)");
            process.exit();
            break;
    }
    console.log(
        `MCMU - MinecraftMultiplayer
向Minecraft致敬！
作者：FancyFlame
输入“npm i mcmu -g”来更新到最新版MCMU
客户端连接后若长时间无响应，请关闭后再次连接到房主
(按Ctrl+C关闭映射)

当前DEBUG等级为${DEBUGLEVEL}，${DEBUGLEVELEXPLAIN[DEBUGLEVEL]}`
    );
}
function config() {
    let srv = http.createServer(function (req, res) {
        if (req.method == "POST") {
            req.on("data", function (data) {
                data = data.toString().split("\r\n");
                let obj = {};
                data = data.forEach(x => {
                    x = x.split("=");
                    obj[x[0]] = x[1];
                });
                fs.writeFileSync("mcmu_config.json", JSON.stringify(obj));
                let rs = fs.createReadStream(tp("success.html"));
                rs.pipe(res);
                rs.on("end", function () {
                    console.log("配置已完成");
                    process.exit(0);
                });
            });

        } else {
            let m = fs.readFileSync(tp("config.html"), "utf8");
            res.end(m.replace("_json", "_json=" + ConfigFile));
        }
    });
    srv.listen(7774, function () {
        let url = "http://localhost:" + srv.address().port + "/";
        console.log("\n\n配置服务器已运行。系统将尝试打开您的浏览器，如果未启动请用浏览器访问" + url +
            "\n提交页面后自动完成配置");
        let cmd;
        if (process.platform == 'win32') {
            cmd = 'start';
        } else if (process.platform == 'linux' || process.platform == "android") {
            cmd = 'xdg-open';
        } else if (process.platform == 'darwin') {
            cmd = 'open';
        }
        require("child_process").exec(cmd + " " + url);
    });

}
function client(code, pwd) {
    let msgrPgr = createProgress("msgr");
    let gamePgr = createProgress("game");
    createProgressShower(msgrPgr, gamePgr);
    let msgr = pro.createClient(rmtport, rmtaddr, code, "Messenger");
    let game = pro.createClient(rmtport, rmtaddr, code, "Gamer");
    let msgr2 = dgram.createSocket({
        type: "udp4",
        reuseAddr: true
    });
    let game2 = dgram.createSocket("udp4");
    let fakegameport;//这是用于改写描述包的
    let mcgameport;//本地mc的
    let msgrport;
    const exit = () => process.exit(0);
    msgr2.bind(19132, () => {
        console.log("本地信使端口已开启");
        msgr2.on("message", (msg, rinfo) => {
            if (isLocal(rinfo.address)) {
                //logs("msgr2")
                msgrPgr.rcdlcl();
                msgrport = rinfo.port;
                if (msgr.state != "ready" || msgr.udp.isTimeout) return;
                msgr.udp.Send(msg);
            } else {
                logs(rinfo);
            }
        });
    });
    msgr2.on("error", function (err) {
        if (err.code == "EADDRINUSE") {
            console.log("请先关闭Minecraft后再运行MCMU");
        }
        process.exit();
    });
    msgr.on("Connect", () => {
        console.log("信使管道已连接");
        msgr.udp.on("Message", (d) => {
            //logs("msgr");
            msgrPgr.rcdsrv();
            let s = d.toString("binary");
            //示例：6��c��V�o�����������4VxYMCPE;Maddogchx;389;1.14.1;1;8;9636815373020996724;空的超平坦;Creative;1;62475;62476;
            s = s.split(";");
            s[1] = "MCMU_" + s[1];
            s.splice(-3, 2, fakegameport, fakegameport + 1);
            s = s.join(";");
            //console.log("服务器："+s);
            msgr2.send(Buffer.from(s, "binary"), msgrport);
        });
        msgr.udp.on("Timeout", () => {
            msgrPgr.broken = true;
            //console.log("信使管道连接超时，已断开！");
        });
    });
    game2.bind(() => {
        console.log("游戏数据端口已开启");
        fakegameport = game2.address().port;
        game2.on("message", (msg, rinfo) => {
            //logs("game2");
            gamePgr.rcdlcl();
            mcgameport = rinfo.port;
            if (game.state != "ready" || game.udp.isTimeout) return;
            game.udp.Send(msg);
        });
    });
    game.on("Connect", () => {
        console.log("游戏数据管道已连接");
        //fakegameport=udp.address().port;
        game.udp.on("Message", (d) => {
            //logs("game");
            gamePgr.rcdsrv();
            game2.send(d, mcgameport);
        });
        game.udp.on("Timeout", _ => {
            console.log("游戏数据管道连接超时，已断开！");
            gamePgr.broken = true;
            process.exit();
        });
    });
    msgr.on("Error", (reason) => {
        console.log("连接失败，因为：" + reason);
        setTimeout(exit, 500);
    });
}
function host() {
    let host = pro.createHost(rmtport, rmtaddr);
    host.on("Connect", (code) => {
        console.log("已连接到服务器，编码是" + code);
    });
    let gameport;
    host.on("Join", (name, cli) => {
        let skt;
        if (name == "Messenger") {
            console.log("Messenger joined");
            skt = dgram.createSocket("udp4");
            skt.bind(() => {
                skt.setBroadcast(true);
                cli.on("Message", (msg) => {
                    //TODO
                    logs("msgr");
                    skt.send(msg, 19132);
                });
                skt.on("message", (msg, rinfo) => {
                    if (isLocal(rinfo.address)) {
                        //描述包
                        let s = msg.toString().split(";");
                        logs("msgr2");
                        gameport = parseInt(s[s.length - 3]);
                        cli.Send(msg);
                    }
                });
            });
        } else if (name == "Gamer") {
            //游戏数据
            console.log("Gamer joined");
            skt = dgram.createSocket("udp4");
            skt.bind(() => {
                cli.on("Message", (d) => {
                    logs("game");
                    skt.send(d, gameport);
                });
                skt.on("message", (msg, rinfo) => {
                    if (isLocal(rinfo.address)) {
                        logs("game2");
                        cli.Send(msg);
                    }
                });
            });
        } else if (name == "Ping") {
            cli.on("message", (msg) => {
                cli.Send("Pong!");
            });
        }
        if (skt) {
            skt.on("close", _ => { try { cli.close(); } catch (err) { } });
            cli.on("close", _ => {
                if (skt) {
                    try {
                        skt.close();
                    } catch (err) { }
                }
            });
        }
    });
    host.on("Exit", (name) => {
        console.log(name + " Exitted");
    });
    host.on("Error", (err) => {
        console.log(err);
    });
    host.on("close", () => console.log("连接已断开。新的玩家无法加入，但现有的玩家将会继续游戏。"));
}
function server() {
    let srv = pro.createServer();
    srv.listen(srvport);
    srv.on("listening", () => {
        console.log(`服务器已在localhost:${srvport}上运行`);
    });
    srv.on("hostjoin", (id) => {
        console.log(`有编号为${id}的房主连接`);
    });
    srv.on("hostexit", (id) => {
        console.log(`编号为${id}的房主断开连接`);
    });
    srv.on("clientjoin", (id, num) => {
        if (num % 2 == 0) console.log(`有玩家加入${id}，当前在线人数${num / 2}`);
    });
    srv.on("clientexit", (num) => {
        if (num % 2 == 0) console.log(`有玩家退出，当前在线人数${num / 2}`);
    });
    srv.on("Error", err => console.log(err));
}
function ping_(code) {
    let cli = pro.createClient(rmtport, rmtaddr, code, "Ping");
    cli.on("Connect", (udp) => {
        console.log("测试已连接");
        setInterval(() => {
            console.log("Ping!");
            udp.Send("Ping!");
        }, 1000);
        udp.on("message", (msg) => {
            console.log(msg.toString());
        });
    });
    cli.on("Error", (reason) => {
        console.log("连接失败，因为：" + reason);
        setTimeout(() => process.exit(), 500);
    });
}

function createProgress(name) {
    if (!new.target) return new createProgress(name);
    let lp = [];
    let sp = [];
    this.refresh = () => {
        function foo(a) {
            if (a[0] == 0 && [0] == 0) return;
            a.unshift(0);
            if (a.length > 30) a.pop();
        }
        foo(lp);
        foo(sp);
        //console.log(JSON.stringify(sp)+"\n\n\n")
    };
    this.rcdlcl = (p) => {
        lp[0]++;
    };
    this.rcdsrv = (p) => {
        sp[0]++;
    };
    this.broken = false;
    this.getStr = () => {
        let a = 0, b = 0;
        lp.forEach(x => a += x);
        sp.forEach(x => b += x);
        a = Math.round(a / lp.length);
        b = Math.round(b / sp.length);
        let perc = b / a;
        if (this.broken) perc = 0;
        let str = ncs.progress({
            barWord: "|",
            length: 20,
            joinWith: ncs("blackBG"),
            keepAtLeastOne: !this.broken,
            progress: perc || 0
        });
        let clr = !isNaN(perc) ? (perc < 0.3 ? "red" : (perc < 0.8 ? "yellow" : "green")) : "blue";
        return `${ncs(clr + " bold " + (this.broken ? "strikethrough" : ""))}${name}${ncs("!bold !strikethrough white")}:` +
            `[${ncs(clr + "BG")}` + str + `${ncs("reset")}] ${this.broken ? ncs("red") + "Broken" + ncs("reset") : `↑${a}↓${b}`}`;
    };
}
function createProgressShower() {
    let arr = [...arguments];
    setInterval(() => {
        let str = "调试面板";
        arr.forEach(x => {
            str += "\n" + x.getStr();
            x.refresh();
        });
        ncs.clearLines(str);
        console.log(str);
    }, 1000);
}