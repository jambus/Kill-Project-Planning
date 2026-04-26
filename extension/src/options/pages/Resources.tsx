import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Plus, Trash2 } from 'lucide-react';
import { addResource, deleteResource } from '../../db/services';

export const Resources = () => {
  const resources = useLiveQuery(() => db.resources.toArray());
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ 
    name: '', 
    role: '前端工程师', 
    capacity: 100, 
    skills: '' 
  });

  const roles = [
    '前端工程师',
    '后端工程师',
    '全栈工程师',
    'APP工程师',
    '测试工程师'
  ];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await addResource({
      name: formData.name,
      role: formData.role,
      capacity: Number(formData.capacity),
      skills: formData.skills.split(',').map(s => s.trim()).filter(Boolean)
    });
    setShowModal(false);
    setFormData({ name: '', role: '前端工程师', capacity: 100, skills: '' });
  };

  const handleDelete = async (id?: number) => {
    if (id && window.confirm('确认删除此资源吗？')) {
      await deleteResource(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">人员管理</h2>
          <p className="text-gray-500 mt-1">维护研发团队成员及其专业角色</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md shadow-sm text-sm font-medium"
        >
          <Plus size={16} />
          <span>添加人员</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-sm">
              <th className="p-4 font-medium">姓名</th>
              <th className="p-4 font-medium">角色</th>
              <th className="p-4 font-medium text-center">可用负荷 (%)</th>
              <th className="p-4 font-medium">技能标签</th>
              <th className="p-4 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {resources?.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-gray-400">
                  暂无人员数据，请点击右上角添加您的团队成员。
                </td>
              </tr>
            ) : null}
            {resources?.map(r => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="p-4 font-bold text-gray-900">{r.name}</td>
                <td className="p-4">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                    r.role === '测试工程师' 
                      ? 'bg-teal-50 text-teal-700 border-teal-100' 
                      : r.role === '全栈工程师'
                      ? 'bg-purple-50 text-purple-700 border-purple-100'
                      : 'bg-blue-50 text-blue-700 border-blue-100'
                  }`}>
                    {r.role}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-16 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{width: `${r.capacity}%`}}></div>
                    </div>
                    <span className="text-sm text-gray-600 font-mono">{r.capacity}%</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1">
                    {r.skills.length > 0 ? r.skills.map(s => (
                      <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded border border-gray-200 font-medium">
                        {s}
                      </span>
                    )) : <span className="text-gray-300 text-xs">-</span>}
                  </div>
                </td>
                <td className="p-4 text-right">
                  <button onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-[450px] transform animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-6">新增团队成员</h3>
            <form onSubmit={handleAdd} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">姓名</label>
                <input 
                  required 
                  placeholder="例如：张三"
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">角色定位</label>
                <select 
                  value={formData.role} 
                  onChange={e => setFormData({...formData, role: e.target.value})} 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all cursor-pointer bg-white"
                >
                  {roles.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">可用负荷 (%)</label>
                <div className="flex items-center space-x-4">
                  <input 
                    type="range" 
                    min="1" 
                    max="100" 
                    value={formData.capacity} 
                    onChange={e => setFormData({...formData, capacity: Number(e.target.value)})}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <span className="text-sm font-mono font-bold text-blue-600 w-12 text-right">{formData.capacity}%</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">技能标签 (英文逗号分隔)</label>
                <input 
                  placeholder="React, Vue, iOS, Spring Boot" 
                  value={formData.skills} 
                  onChange={e => setFormData({...formData, skills: e.target.value})} 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                />
              </div>
              <div className="pt-6 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-200 transition-all"
                >
                  保存成员
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
