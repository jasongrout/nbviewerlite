#!/usr/bin/env python
# coding: utf-8

# # Magics and shell commands
# 
# Some *markdown*, with a [link](https://jupyter.org).

# In[1]:


get_ipython().run_line_magic('matplotlib', 'inline')
import numpy as np
get_ipython().system('pip install -q pandas')


# In[2]:


files = get_ipython().getoutput('ls *.ipynb')
t = get_ipython().run_line_magic('timeit', '-o np.arange(10)')
get_ipython().run_line_magic('pinfo', 'np.arange')


# In[3]:


get_ipython().run_cell_magic('bash', '', 'echo "hello"\necho \'world\'\n')


# In[ ]:





# In[ ]:


def f(x):

    return x  # 100%


# 
raw, no mimetyperaw python
# In[8]:


print("café ☕")
get_ipython().run_line_magic('time', '1')


# In[9]:


x = 1
x


# Last line
# of markdown
