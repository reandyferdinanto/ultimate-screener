# INDICATOR SQUEEZE DELUXE

// This Pine Script™ code is subject to the terms of the Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0) https://creativecommons.org/licenses/by-nc-sa/4.0/
// © EliCobra

//@version=5
indicator("Squeeze Momentum Deluxe", "[Ʌ] -‌ Squeeze Deluxe", false, explicit_plot_zorder = true, max_lines_count = 500, max_labels_count = 500)

_                                                                                                                                                                                                                                   ='  
                           +-----------------------+
                           ┃       Constants       ┃
                           +-----------------------+                                                                                                                                                                                   '//{

const string tg  = 'Choose how to display the Confluence Gauges.'
const string tm  = 'Calibrates the length of the main oscillator ribbon as well as the period for the squeeze algorithm.'
const string ts  = 'Controls the width of the ribbon.\nLower values result in faster responsiveness at the cost of premature positives.'
const string td  = 'Adjusts a threshold to limit the amount of divergences detected based on strength.\nHigher values result in less detections.'
const string go  = 'Squeeze Momentum'
const string gd  = 'Directional Flux'
const string gl  = 'Divergences'
const string gg  = 'Gauges'
const string ss  = 'Sell Signal'       
const string sb  = 'Buy  Signal'       
const string sob = 'Momentum Bullish'  
const string sos = 'Momentum Bearish'  
const string sfb = 'Flux     Bullish'  
const string sfs = 'Flux     Bearish'  
const string ssb = 'Bullish Swing'     
const string sss = 'Bearish Swing'     
const string sgb = 'Strong Bull Gauge' 
const string sgs = 'Strong Bear Gauge' 
const string swb = 'Weak   Bull Gauge' 
const string sws = 'Weak   Bear Gauge' 
const string shs = 'High   Squeeze'    
const string sms = 'Normal Squeeze'    
const string sls = 'Low    Squeeze'    
const string sds = 'Bearish Divergence'
const string sdb = 'Bullish Divergence'


const color colup = #ffcfa6
const color coldn = #419fec
const color colpf = #ffd0a6
const color coldf = #4683b4
const color colps = #169b5d
const color colng = #970529
const color colpo = #11cf77
const color colno = #d11645
const color colsh = #ff1100
const color colsm = #ff5e00
const color colsl = #ffa600
const color colnt = #787b8635
var   color coltx = chart.fg_color
var   color trnsp = chart.bg_color

//}

_                                                                                                                                                                                                                                   ='  
                           +-----------------------+
                           ┃        Inputs         ┃
                           +-----------------------+                                                                                                                                                                                   '//{

dfb = input.bool  (true  , ""              ,                                       inline = '1', group = gd)
dfl = input.int   (30    , "Length   "     ,  7 ,           50,            1 ,     inline = '1', group = gd)
dfh = input.bool  (false , "Trend Bias"    ,                                                     group = gd)
cps = input.color (colps ,  ""             ,                                       inline = '2', group = gd)
cng = input.color (colng ,  ""             ,                                       inline = '2', group = gd)
cpo = input.color (colpo ,  ""             ,                                       inline = '3', group = gd)
cno = input.color (colno ,  ""             ,                                       inline = '3', group = gd)
smb = input.bool  (true  , ""              ,                                       inline = '1', group = go)
len = input.int   (20    , "Length   "     ,  7 ,           50,            1 , tm,          '1',         go)
sig = input.int   (3     , "Signal       " ,  2 ,            7,            1 , ts,               group = go)
cup = input.color (colup ,  ""             ,                                       inline = '2', group = go)
cdn = input.color (coldn ,  ""             ,                                       inline = '2', group = go)
cpf = input.color (colpf ,  ""             ,                                       inline = '3', group = go)
cdf = input.color (coldf ,  ""             ,                                       inline = '3', group = go)
trs = input.int   (25    , "Sensitivity   ",  20,           40,            1 , td,               group = gl)
dbl = input.bool  (true  , "Lines"         ,                                                     group = gl)
dbs = input.bool  (true  , "Labels"        ,                                                     group = gl)
cdu = input.color (colpo ,  ""             ,                                       inline = '1', group = gl)
cdd = input.color (colno ,  ""             ,                                       inline = '1', group = gl)
gds = input.string('Both', "Showcase     " , ['Both', 'Bull', 'Bear', 'None'], tg,          '4',         gg)
cgp = input.color (colps ,  ""             ,                                       inline = '2', group = gg)
cgn = input.color (colng ,  ""             ,                                       inline = '2', group = gg)

//}

_                                                                                                                                                                                                                                   ='  
                           +-----------------------+
                           ┃         UDTs          ┃
                           +-----------------------+                                                                                                                                                                                   '//{

type bar
    float o = open
    float h = high
    float l = low
    float c = close
    int   i = bar_index

type osc
    float o = na
    float s = na

type squeeze
    bool  h = false
    bool  m = false
    bool  l = false

type gauge
    float u = na
    float l = na
    color c = chart.fg_color
    bool  p = true

type divergence
    float p = na
    float s = na
    int   i = na

type alerts
    bool  b = false
    bool  s = false
    bool  u = false
    bool  d = false
    bool  p = false
    bool  n = false
    bool  x = false
    bool  y = false
    bool  a = false
    bool  c = false
    bool  q = false
    bool  w = false
    bool  h = false
    bool  m = false
    bool  l = false
    bool  e = false
    bool  f = false

type prompt
    string s = ''
    bool   c = false

//}

_                                                                                                                                                                                                                                   ='  
                           +-----------------------+
                           ┃        Methods        ┃
                           +-----------------------+                                                                                                                                                                                   '//{

method notify(prompt p) =>
    if p.c
        alert(p.s, alert.freq_once_per_bar_close)
        
method any(alerts a) =>
    string s = switch
        a.s => ss       
        a.b => sb       
        a.u => sob  
        a.d => sos  
        a.p => sfb  
        a.n => sfs  
        a.x => sss     
        a.y => ssb     
        a.q => sgb 
        a.w => sgs 
        a.a => swb 
        a.c => sws 
        a.h => shs    
        a.m => sms    
        a.l => sls    
        a.e => sds
        a.f => sdb
        =>      na

    prompt.new(s, not na(s))
        
method src(bar b, simple string src) =>
    float x = switch src
        'oc2'   => math.avg(b.o, b.c          )
        'hl2'   => math.avg(b.h, b.l          )
        'hlc3'  => math.avg(b.h, b.l, b.c     )
        'ohlc4' => math.avg(b.o, b.h, b.l, b.c)
        'hlcc4' => math.avg(b.h, b.l, b.c, b.c)

    x

method ha(bar b, simple bool p = true) =>
    var bar x = bar.new(       )
    x.c      := b  .src('ohlc4')
    x        := bar.new(
         na(x.o[1]) ? b.src('oc2') : nz(x.src('oc2')[1]),
         math.max(b.h, math.max(x.o, x.c))              ,
         math.min(b.l, math.min(x.o, x.c))              ,
         x.c                                            )

    p ? x : b

method atr(bar b, simple int len = 1) =>
    float tr = 
         na      (   b.h[1]          ) ? 
                     b.h    - b.l      : 
         math.max(
         math.max(
                     b.h    - b.l      , 
         math.abs(   b.h    - b.c[1])) , 
         math.abs(   b.l    - b.c[1]))

    len == 1 ? tr : ta.rma(tr, len)

method stdev(float src, simple int len) =>
    float sq  = 0.
    float psq = 0.
    float sum = 0.
    
    for k = 0 to len - 1
        val  = nz(src[k])
        psq :=        sq
        sq  += (val - sq) / (1   + k  )
        sum += (val - sq) * (val - psq)
        
    math.sqrt(sum / (len - 1))

method osc(bar b, simple int sig, simple int len) =>
    float av = ta .sma(b.src('hl2'), len)
    bar   z  = bar.new(
                         b.o            ,
                         ta.highest(len),
                         ta.lowest (len),
                         b.c            )
    
    float x  = ta.linreg((z.c - math.avg(z.src('hl2'), av)) / z.atr() * 100, len, 0)

    osc.new(x, ta.sma(x, sig))

method dfo(bar b, simple int len) =>
    float tr = b .atr   (               len)
    float up = ta.rma   (
             math.max   (
               ta.change(b.h)     , 0), len) / (tr)
    float dn = ta.rma   (
             math.max   (
               ta.change(b.l) * -1, 0), len) / (tr)
    float x  = ta.rma   (
             (up - dn) / (up + dn)    , len  / 2) * 100

    osc.new(
              x        , 
              x > +25  ? 
             (x -  25) : 
              x < -25  ? 
             (x +  25) : 
              na       )

method sqz(bar b, simple int len) =>
    array<bool> sqz = array.new<bool>(   )
    float       dev = b.c  .stdev    (len)
    float       atr = b    .atr      (len)

    for i = 2 to 4
        sqz.unshift(dev < (atr * 0.25 * i))

    squeeze.new(sqz.pop(), sqz.pop(), sqz.pop())

method draw(bar b, osc o, simple int trs, simple bool s) =>
    var divergence d = divergence.new(          )
    bool           u = ta.crossunder (o.o  , o.s)
    bool           l = ta.crossover  (o.o  , o.s)
    float          x =                o.s
    bool           p =                false

    switch
        o.o >  trs and u and barstate.isconfirmed =>
            switch
                na(d.p) =>
                    d     := divergence.new(b.h, x, b.i)
                    p     := false

                not na(d.p) =>
                    if b.h > d.p and x < d.s
                        if s
                            line.new(d.i, d.s, b.i, x, xloc.bar_index, extend.none, cdd)
                        d := divergence.new(           )
                        p := true
                    else
                        d := divergence.new(b.h, x, b.i)
                        p := false
            
        o.o < -trs and l and barstate.isconfirmed =>
            switch
                na(d.p) =>
                    d     := divergence.new(b.l, x, b.i)
                    p     := false

                not na(d.p) =>
                    if b.l < d.p and x > d.s
                        if s
                            line.new(d.i, d.s, b.i, x, xloc.bar_index, extend.none, cdu)
                        d := divergence.new(           )
                        p := true
                    else
                        d := divergence.new(b.l, x, b.i)
                        p := false
    
    p

//}

_                                                                                                                                                                                                                                   ='  
                           +-----------------------+
                           ┃         Calc          ┃
                           +-----------------------+                                                                                                                                                                                   '//{

bar     b = bar      .new (           )
squeeze s = b        .sqz (        len)
osc     o = b        .osc (sig,    len)
osc     v = b.ha(dfh).dfo (        dfl)
bool    p = b        .draw(o, trs, dbl)
gauge   u = gauge    .new (
     +75                              ,
     +70                              ,
     v.o >   0     and o.o >   0      ? 
               cgp                    : 
     v.o >   0     or  o.o >   0      ? 
     color.new(cgp  , 40)             : 
               colnt                  ,
     gds == 'Both' or  gds == 'Bull'  )
gauge   d = gauge    .new (
     -75                              ,
     -70                              ,
     v.o <   0     and o.o <   0      ? 
               cgn                    : 
     v.o <   0     or  o.o <   0      ? 
     color.new(cgn  , 40)             : 
               colnt                  ,
     gds == 'Both' or  gds == 'Bear'  )


alerts  a = alerts   .new (
                           ta.crossover (o.o,     o.s) and o.o < -40 and v.o < 0    ,
                           ta.crossunder(o.o,     o.s) and o.o > +40 and v.o > 0    ,
                           ta.crossover (o.o,       0)                              ,
                           ta.crossunder(o.o,       0)                              ,
                           ta.crossover (v.o,       0)                              ,
                           ta.crossunder(v.o,       0)                              ,
                           ta.crossunder(o.o,     o.s) and smb                      ,
                           ta.crossover (o.o,     o.s) and smb                      ,
                           ta.change    (u.c == colnt) and u.c == color.new(cgp, 40),
                           ta.change    (d.c == colnt) and d.c == color.new(cgn, 40),
                           ta.change    (u.c == colnt) and u.c ==           cgp     ,
                           ta.change    (d.c == colnt) and d.c ==           cng     ,
                           ta.change    (s.h         ) and s.h                      ,
                           ta.change    (s.m         ) and s.m                      ,
                           ta.change    (s.l         ) and s.l                      ,
                           p                           and o.o >  trs               ,
                           p                           and o.o < -trs               )

//}

_                                                                                                                                                                                                                                   ='  
                           +-----------------------+
                           ┃        Visuals        ┃
                           +-----------------------+                                                                                                                                                                                   '//{

color colsq = s.h       ?           colsh      : s.m ?     colsm      : colsl
color colvf = v.o > 0   ? color.new(cps  , 70) : color.new(cng  , 70)
color colof = v.s > 0   ? color.new(cpo  , 70) : color.new(cno  , 70)
color colsf = o.o > o.s ? color.new(cpf  , 50) : color.new(cdf  , 50)
color colzf = o.o > o.s ?           cup      :             cdn


m  = hline(0             , "Mid-Line"   , color.new(coltx, 70),    hline.style_dashed                                   )
l  = plot (dfb ? v.o : na, "Flux"       ,           colvf     , 1, plot.style_area                                      )
z  = plot (dfb ? v.s : na, "OverFlux"   ,           colof     , 1, plot.style_areabr                                    )
w  = plot (smb ? o.o : na, "Mom"        ,           colzf     , 1, plot.style_line                                      )
q  = plot (s.l ?   1 : na, "Squeeze"    ,           colsq     , 1, plot.style_columns, false, -1, display = display.pane)
j  = plot (a.x ? o.s : na, "Trend Shift",           cdf       , 2, plot.style_circles,            display = display.pane)
k  = plot (a.y ? o.o : na, "Trend Shift",           cpf       , 2, plot.style_circles,            display = display.pane)
c  = plot (smb ? o.s : na, "Signal"     ,                                                         display = display.none)
ll = plot (d.p ? d.l : na, "Lower Gauge",                                                         display = display.none)
hl = plot (d.p ? d.u : na, "Lower Gauge",                                                         display = display.none)
hh = plot (u.p ? u.u : na, "Upper Gauge",                                                         display = display.none)
lh = plot (u.p ? u.l : na, "Upper Gauge",                                                         display = display.none)

plotshape(u.p and a.s ? u.u + 10 : na, "Confluence Sell"   , shape.triangledown, location.absolute, colno, size = size.tiny)
plotshape(d.p and a.b ? d.l - 15 : na, "Confluence Buy "   , shape.triangleup  , location.absolute, colpo, size = size.tiny)
plotshape(dbs and a.e ? o.s +  3 : na, "Bearish Divergence", shape.labeldown   , location.absolute, colnt, 0, '𝐃▾', colsm  )
plotshape(dbs and a.f ? o.s -  3 : na, "Bullish Divergence", shape.labelup     , location.absolute, colnt, 0, '𝐃▴', colsm  )

fill(w , c , colsf)
fill(lh, hh, u.c  )
fill(ll, hl, d.c  )

//}

_                                                                                                                                                                                                                                   ='  
                           +-----------------------+
                           ┃        Alerts         ┃
                           +-----------------------+                                                                                                                                                                                   '//{

alertcondition(a.s, "Confluence Sell"            , ss )
alertcondition(a.b, "Confluence Buy "            , sb )
alertcondition(a.u, "Momentum Midline Crossover ", sob)
alertcondition(a.d, "Momentum Midline Crossunder", sos)
alertcondition(a.p, "Flux     Midline Crossover ", sfb)
alertcondition(a.n, "Flux     Midline Crossunder", sfs)
alertcondition(a.y, "Momentum Swing   Crossover ", ssb)
alertcondition(a.x, "Momentum Swing   Crossunder", sss)
alertcondition(a.q, "Strong Bullish Confluence"  , sgb)
alertcondition(a.w, "Strong Bearish Confluence"  , sgs)
alertcondition(a.a, "Weak   Bullish Confluence"  , swb)
alertcondition(a.c, "Weak   Bearish Confluence"  , sws)
alertcondition(a.h, "High   Squeeze"             , shs)
alertcondition(a.m, "Normal Squeeze"             , sms)
alertcondition(a.l, "Low    Squeeze"             , sls)
alertcondition(a.e, "Bearish Divergence"         , sds)
alertcondition(a.f, "Bullish Divergence"         , sdb)

a.any().notify()

//}

