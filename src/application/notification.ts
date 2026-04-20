import Notification from "../infrastructure/schemas/Notification";

export const createNotification = async (params: {
  companyId: string;
  type: string;
  title: string;
  message: string;
  orderId?: string;
  link?: string;
}) => {
  const notification = new Notification({
    companyId: params.companyId,
    type: params.type,
    title: params.title,
    message: params.message,
    orderId: params.orderId || null,
    link: params.link || null,
  });
  await notification.save();
  return notification;
};

export const getNotifications = async (companyId: string, unreadOnly = false) => {
  const query: Record<string, unknown> = { companyId };
  if (unreadOnly) query.read = false;

  return Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
};

export const getUnreadCount = async (companyId: string) => {
  return Notification.countDocuments({ companyId, read: false });
};

export const markAsRead = async (companyId: string, notificationId: string) => {
  await Notification.updateOne({ _id: notificationId, companyId }, { read: true });
};

export const markAllAsRead = async (companyId: string) => {
  await Notification.updateMany({ companyId, read: false }, { read: true });
};
