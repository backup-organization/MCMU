                                                                                                                                                                
const [
  fs, net, Url, dgram, os, ncs
] = (function () {
  return [...arguments].map(x => require(x));
})(
  "fs", "net", "url", "dgram", "os", "./node-console.js"
);
//const port;
function tp(p) {
  return __dirname + "/" + p;
}

function gennum() {
  let str = "";
  while (str.length < 16) {
    str += Math.floor(Math.random() * 36).toString(36).toUpperCase();
  }
  return str;
}
const Pack = obj => Buffer.from(JSON.stringify(obj) + "\r\n");
const Unpack = buf => {
  let s = buf.toString();
  if (s == "\r\n" || !s) return null;
  return JSON.parse(s.slice(-2) == "\r\n" ? s.slice(0, -2) : s);
}
const AutoUnpack = (c, fn) => {
  let rest;
  c.on("data", (buf) => {
    if (rest) buf = Buffer.concat([rest, buf]);
    buf = buf.toString("utf8").split("\r\n");
    rest = Buffer.from(buf.pop());
    buf = buf.map(x => Unpack(x));
    buf.forEach(function (e) {
      if (e == null) return;
      fn.apply(null, arguments);
    });
  });
}
const CHECK_INTERVAL=20*1000;

/*
格式
{
  method:方法
  status:响应状态，0成功1失败
  reason:失败原因
}
用\r\n分割
*/
/*let wlan;
setInterval(() => wlan = getWlanIP(), 5000);
wlan = getWlanIP();*/

const createServer = function () {
  /*
  hostjoin(code)事件
  clientjoin(code,onlind)事件，online为当前在线数
  hostexit(code)事件
  clientexit(online)事件：玩家退出
  online：返回一个数字，代表当前在线数。不可设置。
  */
  let udps=Array(5).fill(1);
  const usedIds = {};//用来对应房主
  const udpmap = new Map();//用来映射udp传输
  const srv = net.createServer((c) => {
    AutoUnpack(c, (e, i) => {
      switch (e.method) {
        //创建房间
        case "create":
          const id = Math.random().toString().slice(2, 8);
          if (usedIds[id]) {
            c.end(Pack({
              method: "create",
              status: 1,
              reason: "too many hosts"
            }));
            break;
          }
          usedIds[id] = c;
          c.write(Pack({
            method: "create",
            status: 0,
            code: id
          }));
          srv.emit("hostjoin", id);
          //基站关闭
          c.on("close", () => {
            delete usedIds[id];
          });
          c.on("error", err => { srv.emit("Error", err) });
          break;


        case "connect":
          const udp=udps[Math.floor(Math.random()*udps.length)];
          const udpPort=udp.address().port;
          const host = usedIds[e.code];
          if (!host) {
            c.end(Pack({
              method: "connect",
              status: 1,
              reason: "host not found"
            }));
            break;
          }
          //有客户端
          //c是客户端，host是远程房主
          //验证码
          let confirm = gennum();
          host.write(Pack({
            method: "connect2",
            name: e.name,
            confirm: confirm,
            port: udpPort
          }));
          c.write(Pack({
            method: "connect",
            status: 0,
            confirm: confirm,
            port: udpPort
          }))
          //建立UDP连接
          {
            const cfm = [];
            udp.on("message", function (msg, rinfo) {
              let para = rinfo.port + ";" + rinfo.address;
              if (msg.toString() == confirm && !cfm.includes(para)) {
                cfm.push(para);
                if (cfm.length == 2) {
                  let [aa, bb] = cfm;
                  //连接完成。
                  //连接完成后向双方tcp发送连接完成数据包
                  //并断开客户端的连接
                  c.end(Pack({
                    method: "confirm",
                    status: 0
                  }));
                  host.write(Pack({
                    method: "confirm",
                    status: 0,
                    confirm: confirm
                  }));

                  const cmap = new (function () {
                    //这里计算调用resetCheck的次数，因为再清理不活动
                    //项目的时候会清理两次
                    let resetTimes = 0;
                    this.check = [];
                    let m = {
                      [aa]: bb.split(";"),
                      [bb]: aa.split(";")
                    };
                    this.get = function (from) {
                      let c = this.check.indexOf(from);
                      if (c >= 0) {
                        this.check.splice(c, 1);
                      }
                      return m[from];
                    };
                    this.remove = () => {
                      cfm.forEach(e => udpmap.delete(e));
                    }
                    this.resetCheck = () => {
                      if (++resetTimes == 2) {
                        this.check = Object.keys(m);
                        resetTimes = 0;
                      }
                    }
                  })();

                  cfm.forEach(e => {
                    if (udpmap.has(e)) udpmap.get(e).remove();
                    udpmap.set(e, cmap)
                  });
                  srv.emit("clientjoin", e.code,srv.online);
                  udp.off("message", arguments.callee);
                }
              }
            });
          }
          break;
      }
    });
    c.on("error", (err) => {
      console.log(err);
    })
  });
  udps=udps.map(x=>{
    x=dgram.createSocket("udp4");
    x.bind();
    x.on("message", (msg, rinfo) => {
      let para = rinfo.port + ";" + rinfo.address;
      let target = udpmap.get(para);
      if (target) {
        let t = target.get(para);
        x.send(msg, ...t);
      }
    });
    return x;
  });
  //每分钟检查一次udp活动状态
  setInterval(() => {
    udpmap.forEach((e) => {
      if (e.check.length == 0) {
        e.resetCheck();
      } else {
        e.remove();
        srv.emit("clientexit",srv.online);
      }
    });
  }, CHECK_INTERVAL);
  srv.on("error", (err) => { });//console.log(err)})
  Object.defineProperty(srv,"online",{
    get:()=>{
      return udpmap.size/2;
    }
  })
  return srv;
}



const createClient = function (Port, Addr, IPcode, name) {
  /*
    udp：Sender对象
    state：
    Failed事件：
    Connect(udp)事件：UDP已连接到主机，然后
      TCP连接就会关闭，但仍可以接收事件
    Message(...)事件：绑定udp的Message事件
  */
  let c = net.createConnection(Port, Addr, () => {
    c.write(Pack({
      method: "connect",
      code: IPcode,
      name: name
    }));
    AutoUnpack(c, (e) => {
      if (e.status) {
        c.emit("Error", e.reason);
        return;
      }
      switch (c.state) {
        case "waiting":
          c.udp = createSender(e.port, Addr, e.confirm);
          c.state = "confirm";
          break;
        case "confirm":
          //c.end();
          c.state = "ready";
          c.udp.stopSendingConnectPack();
          c.udp.on("message", function () {
            c.emit("Message", ...arguments);
          });
          c.emit("Connect", c.udp);
          break;
      }
    })
  });
  c.state = "waiting";
  return c;
}



const createHost = function (Port, Addr) {
  /*
  state：
  Failed事件：连接失败
  Connect事件：已连接到服务器
  Join事件(name,skt)：name是请求的名字，
    skt是Sender，用于和远程主机通讯
  */
  let heartbeat;
  let code;
  let c;
  let connToSrv = () => net.createConnection(Port, Addr, () => {
    //防止超时
    c.write(Pack({
      method: "create",
      status: 2
    }));

    c.on("error", (err) => {
      if (false&&err.code == "ECONNABORTED") {
        c = connToSrv();
        c.emit("Abort");
      } else {
        c.emit("Error", err);
      }
    });
  });
  c = connToSrv();

  c.state = "waiting";
  let checkingSdr = new Map();
  AutoUnpack(c, (e) => {
    //等待确认
    if (c.state == "waiting") {
      if (e.status) {
        c.emit("Error", e.reason);
        c.end();
        c.state = "closed";
        return;
      }
      code = c.code = e.code;
      c.state = "ready"
      heartbeat = setInterval(() => {
        c.write(Buffer.from("\r\n"), Port, Addr);
      }, 10 * 1000);
      c.emit("Connect", code);
    } else if (c.state == "ready") {
      //已连接
      if (e.method == "connect2") {
        //有请求连接
        let sdr = createSender(e.port, Addr, e.confirm);
        sdr.name = e.name;
        checkingSdr.set(e.confirm, sdr);
      } else if (e.method == "confirm") {
        let sdr = checkingSdr.get(e.confirm);
        sdr.stopSendingConnectPack();
        checkingSdr.delete(e.confirm);
        c.emit("Join", sdr.name, sdr);
      }
    }
  });
  c.on("close",()=>clearInterval(heartbeat));
  return c;
}

const PingPack=Buffer.alloc(1);
const createSender = function (Port, Addr, confirm) {
  /*
  只能由服务器自动创建！！
  Send(msg)：发送给服务器
  Message事件(msg,from,rinfo)：from分为server，
    local和native，分别是从服务器发来的，从
    本地主机发来的和从其它主机发来的
  Connect事件：已经可以发送数据了
  Timeout事件：已经因为超时断开连接，会自动销毁套接字
  isTimeout:布尔值，表示是否已超时
  */
  const s = dgram.createSocket("udp4");
  const reminfo = [Port, Addr];
  let received=false;
  s.isTimeout=false;
  s.state = "inactive";
  s.Send = (msg, lis) => s.send(msg, ...reminfo, lis);
  const PingPack=Buffer.alloc(1);
  s.on("message", (msg, rinfo) => {
    if (s.state != "ready"||s.isTimeout) return;
    let { port, address } = rinfo;
    if (port == Port, address == Addr) {
      if(!msg.equals(PingPack))s.emit("Message", msg, "server", rinfo);
      received=true;
    } else if (address == wlan || address == "127.0.0.1") {
      s.emit("Message", msg, "local", rinfo);
    } else {
      s.emit("Message", msg, "native", rinfo);
    }
  });
  s.bind(() => {
    //s.connect(Port, Addr, () => {
    s.state = "waiting";
    let timer = setInterval(() => s.Send(confirm), 1000);
    s.stopSendingConnectPack = () => {
      clearInterval(timer);
      s.state = "ready";
      s.emit("Connect");
      let pinger=setInterval(()=>{
        try{
          s.Send(PingPack);
        }catch(err){
          clearInterval(pinger);
        }
      },Math.floor(CHECK_INTERVAL/5));
      let pingchecker=setInterval(()=>{
        if(!received){
          try{
            s.close(()=>{
              s.emit("Timeout");
              s.isTimeout=true;
            });
          }catch(err){
            s.emit("Timeout");
            s.isTimeout=true;
          }
          clearInterval(pingchecker);
        }else{
          received=false;
        }
      },CHECK_INTERVAL);
    }
    //})
  });
  return s;
}



function getWlanIP() {
  let obj = os.networkInterfaces();
  let arr=[];
  for (let i in obj) {
    for (let o of obj[i]) {
      if (o.family == "IPv4") arr.push(o.address);
    }
  }
  return arr;
}

module.exports = {
  createServer,
  createHost,
  createClient,
  getWlanIP
}
//test();
function test() {
  createServer().listen(7771);
  let host = createHost(7771, "127.0.0.1");
  host.on("Connect", (code) => {
    console.log("编码：" + code);
    let cli = createClient(7771, "127.0.0.1", code, "扒拉垫");
    cli.on("Connect", (udp) => {
      console.log("已连接");
      udp.on("Message", (msg, from, rinfo) => {
        console.log(msg.toString());
        udp.Send("Faq");
      });
    });
  });
  host.on("Join", (name, skt) => {
    skt.Send("I hear you," + name);
    setInterval(() => {
      skt.Send("yoohoo")
    }, 1000);
    skt.on("Message", (msg) => {
      console.log(msg.toString())
    })
  })
}