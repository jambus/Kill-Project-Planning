import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Plus, Trash2 } from 'lucide-react';
import { addResource, deleteResource } from '../../db/services';

export const Resources = () => {
  const resources = useLiveQuery(() => db.resources.toArray());
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', role: 'Frontend', capacity: 100, skills: '' });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await addResource({
      name: formData.name,
      role: formData.role,
      capacity: Number(formData.capacity),
      skills: formData.skills.split(',').map(s => s.trim()).filter(Boolean)
    });
    setShowModal(false);
    setFormData({ name: '', role: 'Frontend', capacity: 100, skills: '' });
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
          <p className="text-gray-500 mt-1">维护研发团队成员及其技能标签</p>
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
              <th className="p-4 font-medium">可用负荷 (%)</th>
              <th className="p-4 font-medium">技能标签</th>
              <th className="p-4 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {resources?.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400">暂无人员数据，请点击右上角添加。</td>
              </tr>
            ) : null}
            {resources?.map(r => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="p-4 font-medium text-gray-900">{r.name}</td>
                <td className="p-4">
                  <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-md font-medium">{r.role}</span>
                </td>
                <td className="p-4 text-gray-600">{r.capacity}%</td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1">
                    {r.skills.map(s => (
                      <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-sm">{s}</span>
                    ))}
                  </div>
                </td>
                <td className="p-4 text-right space-x-2">
                  <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:text-red-700 p-1">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-[400px]">
            <h3 className="text-lg font-bold mb-4">新增人员</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">姓名</label>
                <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">角色</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full p-2 border rounded">
                  <option value="Frontend">前端开发</option>
                  <option value="Backend">后端开发</option>
                  <option value="Test">测试工程师</option>
                  <option value="Design">UI/UX 设计</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">可用负荷 (%)</label>
                <input type="number" required max={100} min={1} value={formData.capacity} onChange={e => setFormData({...formData, capacity: Number(e.target.value)})} className="w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">技能标签 (逗号分隔)</label>
                <input placeholder="React, Node.js, AWS" value={formData.skills} onChange={e => setFormData({...formData, skills: e.target.value})} className="w-full p-2 border rounded" />
              </div>
              <div className="pt-4 flex justify-end space-x-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">取消</button>
                <button type="submit" className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
