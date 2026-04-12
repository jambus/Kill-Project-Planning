import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { generateSchedule } from '../../services/ai';
import { Play, Calendar, AlertCircle } from 'lucide-react';

export const Dashboard = () => {
  const projects = useLiveQuery(() => db.projects.toArray());
  const resources = useLiveQuery(() => db.resources.toArray());
  const allocations = useLiveQuery(() => db.allocations.toArray());
  
  const [isScheduling, setIsScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateSchedule = async () => {
    if (!resources || !projects) return;
    setIsScheduling(true);
    setError(null);
    try {
      // Clear old allocations for the demo
      await db.allocations.clear();
      
      const newAllocations = await generateSchedule(resources, projects);
      
      // Save new allocations
      for (const alloc of newAllocations) {
        if (alloc.resourceId && alloc.projectId) {
          await db.allocations.add({
            resourceId: alloc.resourceId,
            projectId: alloc.projectId,
            allocationPercentage: alloc.allocationPercentage || 100,
            startDate: alloc.startDate || new Date().toISOString().split('T')[0],
            endDate: alloc.endDate || new Date().toISOString().split('T')[0],
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
        <button 
          onClick={handleGenerateSchedule}
          disabled={isScheduling || !projects?.length || !resources?.length}
          className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-2.5 rounded-lg shadow-md font-medium disabled:opacity-50 transition-all"
        >
          <Play size={18} className={isScheduling ? "animate-pulse" : ""} />
          <span>{isScheduling ? 'AI 正在努力排期中...' : '一键 AI 智能排期'}</span>
        </button>
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
      </div>

      {/* Allocations View */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-medium text-gray-900">当前资源分配状态</h3>
        </div>
        <div className="p-4">
          {allocations?.length === 0 ? (
            <p className="text-gray-400 text-center py-8">暂无排期数据，请点击右上角按钮由 AI 自动生成。</p>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="pb-2 font-medium">人员</th>
                  <th className="pb-2 font-medium">项目</th>
                  <th className="pb-2 font-medium">投入占比</th>
                  <th className="pb-2 font-medium">周期</th>
                </tr>
              </thead>
              <tbody>
                {allocations?.map((alloc) => {
                  const resource = resources?.find(r => r.id === alloc.resourceId);
                  const project = projects?.find(p => p.id === alloc.projectId);
                  return (
                    <tr key={alloc.id} className="border-b border-gray-100">
                      <td className="py-3 font-medium text-gray-900">{resource?.name || 'Unknown'}</td>
                      <td className="py-3 text-blue-600">{project?.name || 'Unknown'}</td>
                      <td className="py-3">
                        <span className="px-2 py-1 bg-green-50 text-green-700 rounded-md font-medium">
                          {alloc.allocationPercentage}%
                        </span>
                      </td>
                      <td className="py-3 text-gray-500">{alloc.startDate} ~ {alloc.endDate}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
};
