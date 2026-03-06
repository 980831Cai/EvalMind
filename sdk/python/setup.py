"""Agent Eval SDK 安装配置"""
from setuptools import setup, find_packages

setup(
    name="agent-eval-sdk",
    version="0.1.0",
    description="Agent 评测平台 Python SDK - 一行代码接入生产级 Agent 评估",
    author="Agent Eval Team",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[],
    extras_require={
        "otel": ["opentelemetry-api>=1.20.0", "opentelemetry-sdk>=1.20.0"],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
