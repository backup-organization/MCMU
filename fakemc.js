                                                                                                                                                                          
const dgram=require("dgram");
let create=()=>dgram.createSocket("udp4");
let Host=create();
let Client=create();
let rinfo;
let pack=[
    1,   0,   0,   0,   0,
    0,  21,  54, 138,   0,
  255, 255,   0, 254, 254,
  254, 254, 253, 253, 253,
  253,  18,  52,  86, 120,
  163, 176, 184,   5,  29,
  118, 101, 231
];
let explain=[28,0,0,0,0,0,21,54,138,146,99,236,202,86,221,111,148,0,255,255,0,254,254,254,254,253,253,253,253,18,52,86,120,0,89,77,67,80,69,59,77,97,100,100,111,103,99,104,120,59,51,56,57,59,49,46,49,52,46,49,59,49,59,56,59,57,54,51,54,56,49,53,51,55,51,48,50,48,57,57,54,55,50,52,59,231,169,186,231,154,132,232,182,133,229,185,179,229,157,166,59,67,114,101,97,116,105,118,101,59,49,59,54,50,52,55,53,59,54,50,52,55,54,59];                        

Host.bind(19131,()=>{
  console.log(Host.address().port);
  //.setBroadcast(true);
});
Host.on("message",(d,info)=>{
  //Host.sdr.send(Buffer.from(explain),info.port,info.address);
  rinfo=info;
})
setInterval(()=>{
  //if(rinfo)Host.send(Buffer.from(explain),rinfo.port,rinfo.address);
  Client.send(Buffer.from(pack), 19131, "255.255.255.255");
  console.log("send");
},1000);
Client.bind(62475,_=>Client.setBroadcast(true));
Client.on("message",(msg)=>{
  console.log("接收到"+msg.toString("utf8"));
})