import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { generateSchedule } from '../../services/ai';
import { Play, Calendar, AlertCircle, Users, ChevronDown } from 'lucide-react';
import { calculateMonthlyMD, getMonthLabel } from '../../utils/dateUtils';

export const Dashboard = () => {
  const projects = useLiveQuery(() => db.projects.toArray());
  const resources = useLiveQuery(() => db.resources.toArray());
  const allocations = useLiveQuery(() => db.allocations.toArray());
  
  const [isScheduling, setIsScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Year Selection Logic
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  // Define months to display based on selected year (e.g., Q2: Apr, May, Jun)
  const displayMonths = [
    { year: selectedYear, month: 4 },
    { year: selectedYear, month: 5 },
    { year: selectedYear, month: 6 },
  ];

  const handleGenerateSchedule = async () => {
    if (!resources || !projects) return;
    setIsScheduling(true);
    setError(null);
    try {
      // Clear old allocations for the demo
      await db.allocations.clear();
      
      const newAllocations = await generateSchedule(resources, projects, selectedYear);
      
      // Save new allocations
      for (const alloc of newAllocations) {
        if (alloc.resourceId && alloc.projectId) {
          await db.allocations.add({
            resourceId: alloc.resourceId,
            projectId: alloc.projectId,
            allocationPercentage: alloc.allocationPercentage || 100,
            startDate: alloc.startDate || `${selectedYear}-01-01`,
            endDate: alloc.endDate || `${selectedYear}-12-31`,
          });
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">全局排期大盘</h2>
          <p className="text-gray-500 mt-1">查看当前项目状态与 AI 智能排期结果</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="relative inline-block">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2.5 pr-10 text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer shadow-sm"
            >
              {yearOptions.map(year => (
                <option key={year} value={year}>{year} 年</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
              <ChevronDown size={16} />
            </div>
          </div>

          <button 
            onClick={handleGenerateSchedule}
            disabled={isScheduling || !projects?.length || !resources?.length}
            className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-2.5 rounded-lg shadow-md font-medium disabled:opacity-50 transition-all"
          >
            <Play size={18} className={isScheduling ? "animate-pulse" : ""} />
            <span>{isScheduling ? 'AI 正在努力排期中...' : '一键 AI 智能排期'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start space-x-3">
          <AlertCircle className="text-red-500 mt-0.5" size={20} />
          <div>
            <h4 className="text-red-800 font-medium">排期失败</h4>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Calendar size={24} /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">待处理项目</p>
            <p className="text-2xl font-bold text-gray-900">{projects?.length || 0}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><Users size={24} /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">资源库人员</p>
            <p className="text-2xl font-bold text-gray-900">{resources?.length || 0}</p>
          </div>
        </div>
      </div>

      {/* Allocations View */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h3 className="font-medium text-gray-900">当前资源分配状态 (按 {selectedYear} 年月度人天统计)</h3>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold">Q2 排期</span>
        </div>
        <div className="p-4">
          {allocations?.length === 0 ? (
            <p className="text-gray-400 text-center py-8">暂无排期数据，请点击右上角按钮由 AI 自动生成。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="pb-3 font-medium min-w-[100px]">人员</th>
                    <th className="pb-3 font-medium min-w-[200px]">项目</th>
                    <th className="pb-3 font-medium">投入占比</th>
                    <th className="pb-3 font-medium">总周期</th>
                    {displayMonths.map(m => (
                      <th key={`${m.year}-${m.month}`} className="pb-3 font-medium text-center bg-gray-50/50">
                        {getMonthLabel(m.year, m.month)}<br/>
                        <span className="text-[10px] text-gray-400 font-normal">工作日投入</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allocations?.map((alloc) => {
                    const resource = resources?.find(r => r.id === alloc.resourceId);
                    const project = projects?.find(p => p.id === alloc.projectId);
                    return (
                      <tr key={alloc.id} className="border-b border-gray-100 hover:bg-gray-50/30 transition-colors">
                        <td className="py-4 font-medium text-gray-900">{resource?.name || 'Unknown'}</td>
                        <td className="py-4 text-blue-600 font-medium">{project?.name || 'Unknown'}</td>
                        <td className="py-4">
                          <span className="px-2 py-1 bg-green-50 text-green-700 rounded-md text-xs font-bold border border-green-100">
                            {alloc.allocationPercentage}%
                          </span>
                        </td>
                        <td className="py-4 text-gray-500 text-xs">
                          {alloc.startDate}<br/>
                          {alloc.endDate}
                        </td>
                        {displayMonths.map(m => {
                          const md = calculateMonthlyMD(
                            alloc.startDate,
                            alloc.endDate,
                            alloc.allocationPercentage,
                            m.year,
                            m.month
                          );
                          return (
                            <td key={`${m.year}-${m.month}`} className="py-4 text-center font-mono font-semibold text-gray-700 bg-gray-50/10">
                              {md > 0 ? `${md.toFixed(1)}d` : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
