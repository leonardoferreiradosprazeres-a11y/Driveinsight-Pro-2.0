import React, { useState, useMemo } from 'react';
import { Trip } from '../types';
import { formatCurrency, formatDecimal } from '../services/calculationService';
import { TrendingUp, Wallet, Clock, Activity, Calendar, Map, Gauge, Coffee, Timer, Zap, Fuel, Hourglass } from 'lucide-react';

interface Props {
  history: Trip[];
}

const Dashboard: React.FC<Props> = ({ history }) => {
  const [filter, setFilter] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [hoveredData, setHoveredData] = useState<any | null>(null);
  
  // Default end time to current time HH:mm
  const [manualEndTime, setManualEndTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  });

  const filteredHistory = useMemo(() => {
    const now = new Date();
    return history.filter(trip => {
      const tripDate = new Date(trip.timestamp);
      if (filter === 'all') return true;
      if (filter === 'today') {
        return tripDate.getDate() === now.getDate() && 
               tripDate.getMonth() === now.getMonth() && 
               tripDate.getFullYear() === now.getFullYear();
      }
      if (filter === 'week') {
        const diffTime = Math.abs(now.getTime() - tripDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      }
      if (filter === 'month') {
        return tripDate.getMonth() === now.getMonth() && 
               tripDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [history, filter]);

  const stats = useMemo(() => {
    const sortedHistory = [...filteredHistory].sort((a, b) => a.timestamp - b.timestamp);

    const totalEarnings = sortedHistory.reduce((acc, curr) => acc + curr.total_price, 0);
    const totalProfit = sortedHistory.reduce((acc, curr) => acc + curr.lucro_liquido, 0);
    const totalFuelCost = sortedHistory.reduce((acc, curr) => acc + curr.custo_total_combustivel, 0);
    const totalTimeInTrips = sortedHistory.reduce((acc, curr) => acc + curr.total_time_min, 0);
    const totalRides = sortedHistory.length;
    const totalKm = sortedHistory.reduce((acc, curr) => acc + curr.total_distance_km, 0);
    
    // Weighted averages
    const avgProfitPerHour = totalTimeInTrips > 0 ? (totalProfit / totalTimeInTrips) * 60 : 0;
    const avgProfitPerRide = totalRides > 0 ? totalProfit / totalRides : 0;
    const avgEarningsPerRide = totalRides > 0 ? totalEarnings / totalRides : 0;
    const avgEarningsPerKm = totalKm > 0 ? totalEarnings / totalKm : 0;

    // New Averages
    const avgKmPerRide = totalRides > 0 ? totalKm / totalRides : 0;
    const avgTimePerRide = totalRides > 0 ? totalTimeInTrips / totalRides : 0;

    // Average of Average Speeds
    // Sum of all vel_media_real divided by count
    const sumVelMedia = sortedHistory.reduce((acc, curr) => acc + curr.vel_media_real, 0);
    const avgGlobalSpeed = totalRides > 0 ? sumVelMedia / totalRides : 0;

    // Fuel % Relative to Gross
    const fuelCostPercentage = totalEarnings > 0 ? (totalFuelCost / totalEarnings) * 100 : 0;

    // Shift / Journey Calculations
    let totalShiftDurationMin = 0;
    let idleTimeMin = 0;
    let avgIntervalMin = 0;
    let startTimeStr = "--:--";

    if (sortedHistory.length > 0) {
        // Find first trip (oldest timestamp)
        const firstTripDate = new Date(sortedHistory[0].timestamp);
        firstTripDate.setSeconds(0, 0);
        const startTime = firstTripDate.getTime();
        
        const lastTripTime = sortedHistory[sortedHistory.length - 1].timestamp;
        
        // Format Start Time for UI
        startTimeStr = firstTripDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        // Construct End Time Date object based on user input and the date of the latest trip
        const [hours, minutes] = manualEndTime.split(':').map(Number);
        const endDate = new Date(lastTripTime);
        endDate.setHours(hours, minutes, 0, 0);

        // Calculate duration in minutes (Journey Time)
        let diffMs = endDate.getTime() - startTime;
        if (diffMs < 0) diffMs = 0; 
        totalShiftDurationMin = Math.floor(diffMs / 1000 / 60);

        // Idle time = Shift Duration - Total Time in Trips
        idleTimeMin = Math.max(0, totalShiftDurationMin - totalTimeInTrips);

        // Average Interval (Time between registers)
        if (totalRides > 1) {
            let sumIntervals = 0;
            for (let i = 1; i < totalRides; i++) {
                const diff = sortedHistory[i].timestamp - sortedHistory[i-1].timestamp;
                sumIntervals += diff;
            }
            const avgMs = sumIntervals / (totalRides - 1);
            avgIntervalMin = Math.round(avgMs / 1000 / 60);
        } else {
            avgIntervalMin = 0;
        }
    }

    return { 
        totalEarnings, 
        totalProfit, 
        totalFuelCost, 
        totalTimeInTrips, 
        totalRides, 
        totalKm, 
        avgProfitPerHour, 
        avgProfitPerRide,
        avgEarningsPerRide, 
        avgEarningsPerKm,
        avgKmPerRide,
        avgTimePerRide,
        avgGlobalSpeed,
        totalShiftDurationMin,
        idleTimeMin,
        avgIntervalMin,
        fuelCostPercentage,
        startTimeStr
    };
  }, [filteredHistory, manualEndTime]);

  const filterOptions = [
    { id: 'today', label: 'Hoje' },
    { id: 'week', label: '7 Dias' },
    { id: 'month', label: 'Mês' },
    { id: 'all', label: 'Total' },
  ];

  // --- Chart Logic ---
  const chartData = useMemo(() => {
    return [...filteredHistory].sort((a, b) => a.timestamp - b.timestamp);
  }, [filteredHistory]);

  const renderChart = () => {
    if (chartData.length < 2) {
      return (
        <div className="h-48 flex items-center justify-center text-gray-400 text-sm italic">
          Dados insuficientes para exibir o gráfico (mín. 2 viagens)
        </div>
      );
    }

    const height = 180;
    const width = 1000;
    const padding = 20;

    const maxVal = Math.max(
      ...chartData.map(d => d.total_price),
      ...chartData.map(d => d.custo_total_combustivel)
    ) * 1.1;

    const minVal = 0;

    const getX = (index: number) => {
      return padding + (index / (chartData.length - 1)) * (width - padding * 2);
    };

    const getY = (value: number) => {
      if (maxVal === 0) return height - padding;
      return height - padding - ((value - minVal) / (maxVal - minVal)) * (height - padding * 2);
    };

    const earningsPath = chartData.map((d, i) => 
        `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.total_price)}`
    ).join(' ');

    const costPath = chartData.map((d, i) => 
        `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.custo_total_combustivel)}`
    ).join(' ');

    return (
      <div className="relative w-full h-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible preserve-3d">
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="1" />
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />

          <path d={costPath} fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-80 drop-shadow-sm" />
          <path d={earningsPath} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-sm" />

          {chartData.map((d, i) => (
            <g key={d.id}>
              <circle 
                cx={getX(i)} cy={getY(d.custo_total_combustivel)} r="4" fill="#ef4444" 
                className="hover:r-6 transition-all cursor-pointer"
                onMouseEnter={() => setHoveredData({ ...d, type: 'cost', x: getX(i), y: getY(d.custo_total_combustivel) })}
                onMouseLeave={() => setHoveredData(null)}
              />
              <circle 
                cx={getX(i)} cy={getY(d.total_price)} r="4" fill="#22c55e" 
                className="hover:r-6 transition-all cursor-pointer"
                onMouseEnter={() => setHoveredData({ ...d, type: 'earn', x: getX(i), y: getY(d.total_price) })}
                onMouseLeave={() => setHoveredData(null)}
              />
            </g>
          ))}
        </svg>
        
        {hoveredData && (
          <div className="absolute top-0 right-0 bg-gray-900/90 text-white text-xs p-2 rounded shadow-lg pointer-events-none z-10 backdrop-blur-sm">
             <p className="font-bold">{new Date(hoveredData.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
             <p className="text-green-400">Bruto: {formatCurrency(hoveredData.total_price)}</p>
             <p className="text-red-400">Custo: -{formatCurrency(hoveredData.custo_total_combustivel)}</p>
          </div>
        )}
      </div>
    );
  };

  const formatHoursMinutes = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return `${h}h ${m}min`;
  };
  
  const formatHoursAndMinutesText = (totalMinutes: number) => {
     const h = Math.floor(totalMinutes / 60);
     const m = Math.round(totalMinutes % 60);
     if (h > 0) return `${h}h e ${m}min`;
     return `${m}min`;
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Visão geral dos seus ganhos</p>
        </div>
        <div className="bg-indigo-100 dark:bg-indigo-900 p-2 rounded-full">
          <Activity className="w-6 h-6 text-indigo-600 dark:text-indigo-300" />
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
        {filterOptions.map(opt => (
          <button
            key={opt.id}
            onClick={() => setFilter(opt.id as any)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              filter === opt.id 
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 shadow-sm' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Main Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Big Earnings & Profit Card */}
        <div className="col-span-2 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 text-white shadow-lg shadow-indigo-200 dark:shadow-none">
          {/* Top Row: Gross and Profit */}
          <div className="flex justify-between items-start mb-4">
            {/* Gross Value */}
            <div>
               <div className="flex items-center space-x-2 mb-1 opacity-80">
                <Wallet className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Valor Bruto</span>
              </div>
              <p className="text-3xl font-black tracking-tight">{formatCurrency(stats.totalEarnings)}</p>
            </div>

            {/* Net Profit */}
            <div className="text-right">
              <div className="flex items-center justify-end space-x-2 mb-1 opacity-80">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Lucro Líquido</span>
              </div>
              <p className="text-3xl font-black tracking-tight text-green-300">{formatCurrency(stats.totalProfit)}</p>
            </div>
          </div>

          {/* Bottom Row: Fuel Cost */}
          <div className="border-t border-white/20 pt-3">
             <div className="flex justify-between items-center">
                 <div className="flex items-center space-x-2 opacity-90">
                     <Fuel className="w-4 h-4" />
                     <span className="text-sm font-medium">Custo Combustível</span>
                 </div>
                 <div className="text-right">
                     <span className="text-lg font-bold text-red-300 mr-2">-{formatCurrency(stats.totalFuelCost)}</span>
                     <span className="text-xs bg-white/20 px-2 py-1 rounded-lg text-white font-medium">{formatDecimal(stats.fuelCostPercentage)}%</span>
                 </div>
             </div>
          </div>
        </div>

        {/* Small Stats Row 1 */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
           <div className="flex items-center space-x-2 mb-2 text-green-600 dark:text-green-400">
             <TrendingUp className="w-4 h-4" />
             <span className="text-xs font-bold uppercase">Média/Hora</span>
           </div>
           <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{formatCurrency(stats.avgProfitPerHour)}</p>
           <p className="text-[10px] text-gray-400 mt-1">Lucro por hora trab.</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
           <div className="flex items-center space-x-2 mb-2 text-blue-600 dark:text-blue-400">
             <Calendar className="w-4 h-4" />
             <span className="text-xs font-bold uppercase">Corridas</span>
           </div>
           <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{stats.totalRides}</p>
           <p className="text-[10px] text-gray-400 mt-1">Média {formatCurrency(stats.avgEarningsPerRide)}/corrida</p>
        </div>

        {/* Small Stats Row 2 */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
           <div className="flex items-center space-x-2 mb-2 text-orange-600 dark:text-orange-400">
             <Map className="w-4 h-4" />
             <span className="text-xs font-bold uppercase">Distância</span>
           </div>
           <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{formatDecimal(stats.totalKm)} km</p>
           <p className="text-[10px] text-gray-400 mt-1">Total percorrido</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
           <div className="flex items-center space-x-2 mb-2 text-purple-600 dark:text-purple-400">
             <Gauge className="w-4 h-4" />
             <span className="text-xs font-bold uppercase">Ganho/Km</span>
           </div>
           <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{formatCurrency(stats.avgEarningsPerKm)}</p>
           <p className="text-[10px] text-gray-400 mt-1">Valor Bruto / Km</p>
        </div>
      </div>

       {/* Journey & Efficiency Section */}
      <div className="space-y-4">
          <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center">
                  <Timer className="w-4 h-4 mr-2" /> Jornada & Eficiência
              </h3>
              <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1 rounded-lg border border-gray-100 dark:border-gray-700">
                  <label htmlFor="endTime" className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Fim da Jornada:</label>
                  <input 
                    id="endTime"
                    type="time" 
                    value={manualEndTime}
                    onChange={(e) => setManualEndTime(e.target.value)}
                    className="bg-transparent text-sm font-bold text-indigo-600 dark:text-indigo-400 outline-none w-20 text-right cursor-pointer"
                  />
              </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
               {/* Tempo Total Jornada */}
               <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                   <div className="flex items-center space-x-2 mb-2 text-gray-600 dark:text-gray-300">
                     <Clock className="w-4 h-4" />
                     <span className="text-xs font-bold uppercase">Tempo Jornada</span>
                   </div>
                   <p className="text-lg font-bold text-gray-900 dark:text-white">{formatHoursMinutes(stats.totalShiftDurationMin)}</p>
                   <p className="text-[10px] text-gray-400 mt-1">Do 1º registro: {stats.startTimeStr} até {manualEndTime}</p>
                </div>

                {/* Tempo Ocioso */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                   <div className="flex items-center space-x-2 mb-2 text-gray-600 dark:text-gray-300">
                     <Coffee className="w-4 h-4" />
                     <span className="text-xs font-bold uppercase">Tempo Ocioso</span>
                   </div>
                   <p className="text-lg font-bold text-gray-900 dark:text-white">{formatHoursMinutes(stats.idleTimeMin)}</p>
                   <p className="text-[10px] text-gray-400 mt-1">Jornada - Tempo em corridas</p>
                </div>

                {/* Tempo Total em Corridas */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                   <div className="flex items-center space-x-2 mb-2 text-gray-600 dark:text-gray-300">
                     <Activity className="w-4 h-4" />
                     <span className="text-xs font-bold uppercase">Tempo em Corridas</span>
                   </div>
                   <p className="text-lg font-bold text-gray-900 dark:text-white">{formatHoursAndMinutesText(stats.totalTimeInTrips)}</p>
                   <p className="text-[10px] text-gray-400 mt-1">Soma de todas as corridas</p>
                </div>

                 {/* Km per Ride */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                   <div className="flex items-center space-x-2 mb-2 text-gray-600 dark:text-gray-300">
                     <Zap className="w-4 h-4" />
                     <span className="text-xs font-bold uppercase">Km/Corrida</span>
                   </div>
                   <p className="text-lg font-bold text-gray-900 dark:text-white">{formatDecimal(stats.avgKmPerRide)} km</p>
                   <p className="text-[10px] text-gray-400 mt-1">Distância média</p>
                </div>

                {/* Avg Time per Ride */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                   <div className="flex items-center space-x-2 mb-2 text-gray-600 dark:text-gray-300">
                     <Hourglass className="w-4 h-4" />
                     <span className="text-xs font-bold uppercase">Tempo Médio</span>
                   </div>
                   <p className="text-lg font-bold text-gray-900 dark:text-white">{Math.round(stats.avgTimePerRide)} min</p>
                   <p className="text-[10px] text-gray-400 mt-1">Tempo médio por corrida</p>
                </div>

                {/* Avg Speed (NEW) */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                   <div className="flex items-center space-x-2 mb-2 text-gray-600 dark:text-gray-300">
                     <Gauge className="w-4 h-4" />
                     <span className="text-xs font-bold uppercase">Velocidade Média</span>
                   </div>
                   <p className="text-lg font-bold text-gray-900 dark:text-white">{formatDecimal(stats.avgGlobalSpeed)} km/h</p>
                   <p className="text-[10px] text-gray-400 mt-1">Média das velocidades</p>
                </div>
          </div>

           {/* Avg Interval (Full Width) */}
           <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center">
               <div className="flex items-center space-x-3">
                   <div className="bg-indigo-50 dark:bg-indigo-900/50 p-2 rounded-full">
                       <Timer className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                   </div>
                   <div>
                       <span className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400 block">Intervalo Médio</span>
                       <span className="text-sm text-gray-400">Tempo entre registros</span>
                   </div>
               </div>
               <div className="text-right">
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{Math.round(stats.avgIntervalMin)} min</p>
               </div>
           </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center justify-between">
             <span className="flex items-center"><Activity className="w-4 h-4 mr-2" /> Movimentação</span>
             <div className="flex gap-2 text-[10px]">
                <span className="flex items-center text-green-600 dark:text-green-400"><div className="w-2 h-2 rounded-full bg-green-500 mr-1"></div> Bruto</span>
                <span className="flex items-center text-red-600 dark:text-red-400"><div className="w-2 h-2 rounded-full bg-red-500 mr-1"></div> Custo</span>
             </div>
          </h3>
          <div className="h-48 w-full">
              {renderChart()}
          </div>
      </div>
    </div>
  );
};

export default Dashboard;