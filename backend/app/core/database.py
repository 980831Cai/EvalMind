"""Prisma 数据库连接管理"""
from prisma import Prisma

prisma = Prisma()


async def connect_db():
    """启动时连接数据库"""
    await prisma.connect()


async def disconnect_db():
    """关闭时断开数据库"""
    await prisma.disconnect()
